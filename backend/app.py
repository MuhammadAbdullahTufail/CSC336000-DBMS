from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
import psycopg2
from psycopg2 import Error
from psycopg2.extras import RealDictCursor
import requests
import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timedelta, time
from decimal import Decimal
from functools import wraps
import secrets
import jwt
import json
import re
import urllib.parse
import urllib.request
from geopy.distance import geodesic
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

# Always load backend/.env (cwd-independent — running from repo root would miss .env otherwise).
_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / '.env')
load_dotenv()  # optional overrides from process cwd if present

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')

SUPABASE_DB_URL = (
    os.getenv('SUPABASE_DB_URL', '').strip()
    or os.getenv('DATABASE_URL', '').strip()
    or os.getenv('POSTGRES_URL', '').strip()
)
SUPABASE_SSLMODE = os.getenv('SUPABASE_SSLMODE', 'require').strip() or 'require'
SUPABASE_URL = os.getenv('SUPABASE_URL', '').strip().rstrip('/')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '').strip()
SUPABASE_STORAGE_BUCKET = os.getenv('SUPABASE_STORAGE_BUCKET', 'vehicle-images').strip() or 'vehicle-images'
ALLOWED_UPLOAD_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

db_config = {
    'host': os.getenv('SUPABASE_DB_HOST', '').strip() or None,
    'user': os.getenv('SUPABASE_DB_USER', '').strip() or None,
    'password': os.getenv('SUPABASE_DB_PASSWORD', '').strip(),
    'dbname': os.getenv('SUPABASE_DB_NAME', 'postgres').strip() or 'postgres',
    'port': int(os.getenv('SUPABASE_DB_PORT', '5432').strip() or 5432),
    'sslmode': SUPABASE_SSLMODE,
}

_TABLE_NAMES = ('User', 'Location', 'Vehicle', 'Listing', 'Booking', 'Payment', 'Revenue')
_PK_BY_TABLE = {
    'User': 'user_id',
    'Location': 'location_id',
    'Vehicle': 'vehicle_id',
    'Listing': 'listing_id',
    'Booking': 'booking_id',
    'Payment': 'payment_id',
    'Revenue': 'revenue_id',
}


def _quote_app_tables(sql: str) -> str:
    """Quote exact table names for Postgres/Supabase while leaving column names unchanged."""
    for table in _TABLE_NAMES:
        sql = re.sub(rf'(?<!")\b{table}\b(?!")', f'"{table}"', sql)
    return sql


def _insert_table_name(sql: str):
    match = re.match(r'\s*INSERT\s+INTO\s+"?([A-Za-z]+)"?\b', sql, flags=re.IGNORECASE)
    if not match:
        return None
    for table in _TABLE_NAMES:
        if table.lower() == match.group(1).lower():
            return table
    return None


class SupabaseCursor:
    """Small adapter that preserves the cursor behavior already used by this app."""

    def __init__(self, pg_cursor):
        self._cursor = pg_cursor
        self.lastrowid = None

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def execute(self, sql, params=None):
        self.lastrowid = None
        rewritten = _quote_app_tables(sql)
        insert_table = _insert_table_name(rewritten)
        if insert_table and ' returning ' not in rewritten.lower():
            rewritten = rewritten.rstrip().rstrip(';') + f' RETURNING {_PK_BY_TABLE[insert_table]}'

        self._cursor.execute(rewritten, params)
        if insert_table:
            row = self._cursor.fetchone()
            if row is not None:
                pk = _PK_BY_TABLE[insert_table]
                self.lastrowid = row[pk] if isinstance(row, dict) else row[0]
        return self

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def close(self):
        self._cursor.close()


class SupabaseConnection:
    """Connection adapter exposing the cursor(dictionary=True) API the routes already use."""

    def __init__(self, pg_connection):
        self._connection = pg_connection

    @property
    def autocommit(self):
        return self._connection.autocommit

    @autocommit.setter
    def autocommit(self, value):
        self._connection.autocommit = bool(value)

    def cursor(self, dictionary=False):
        factory = RealDictCursor if dictionary else None
        return SupabaseCursor(self._connection.cursor(cursor_factory=factory))

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def close(self):
        self._connection.close()

_geolocator = None

PLATFORM_COMMISSION_RATE = 0.10
BOOKING_FEE_USD = 5.0
DELIVERY_USD_PER_MILE = 1.0
SALES_TAX_RATE = 0.08875


def get_geolocator():
    global _geolocator
    if _geolocator is None:
        _geolocator = Nominatim(user_agent=os.getenv('GEOPY_USER_AGENT', 'gorent-csc33600/1.0'))
    return _geolocator


def nominatim_geocode(query: str):
    if not query or not str(query).strip():
        return None, None
    try:
        geo = get_geolocator()
        hit = geo.geocode(query.strip(), timeout=15)
        if hit:
            return hit.latitude, hit.longitude
    except (GeocoderTimedOut, GeocoderServiceError, Exception):
        pass
    return None, None


def photon_geocode(query: str):
    """Photon komoot — free, no API key; fallback when Nominatim fails or blocks."""
    if not query or not str(query).strip():
        return None, None
    try:
        url = 'https://photon.komoot.io/api/?' + urllib.parse.urlencode({'q': query.strip(), 'limit': 1})
        agent = os.getenv('GEOPY_USER_AGENT', 'gorent-csc33600/1.0')
        req = urllib.request.Request(url, headers={'User-Agent': agent})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
        feats = data.get('features') or []
        if not feats:
            return None, None
        coords = feats[0].get('geometry', {}).get('coordinates')
        if not coords or len(coords) < 2:
            return None, None
        lon, lat = float(coords[0]), float(coords[1])
        return lat, lon
    except Exception:
        return None, None


def geocode_from_query_list(queries):
    """Try each query with Nominatim then Photon."""
    seen = set()
    for q in queries:
        if not q:
            continue
        key = q.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        lat, lon = nominatim_geocode(q)
        if lat is not None and lon is not None:
            return lat, lon
        lat, lon = photon_geocode(q)
        if lat is not None and lon is not None:
            return lat, lon
    return None, None


def _pickup_geocode_queries(loc: dict):
    city = (loc.get('city') or '').strip()
    state = (loc.get('state_region') or '').strip()
    postal = (loc.get('postal_code') or '').strip()
    line1 = (loc.get('address_line1') or '').strip()
    country = (loc.get('country') or 'USA').strip()
    parts = [line1, loc.get('address_line2'), city, state, postal, country]
    queries = []
    full = ', '.join(str(p) for p in parts if p)
    if full:
        queries.append(full)
    if line1 and city and state:
        queries.append(f'{line1}, {city}, {state} {postal}, {country}'.strip())
    if city and state:
        queries.append(f'{city}, {state} {postal}, United States'.strip())
        queries.append(f'{city}, {state}, USA')
    if postal:
        queries.append(f'{postal}, United States')
    return queries


def _delivery_geocode_queries(addr: dict):
    city = (addr.get('city') or '').strip()
    state = (addr.get('state_region') or '').strip()
    postal = (addr.get('postal_code') or '').strip()
    line1 = (addr.get('address_line1') or '').strip()
    line2 = (addr.get('address_line2') or '').strip()
    country = (addr.get('country') or 'USA').strip()
    parts = [line1, line2, city, state, postal, country]
    queries = []
    full = ', '.join(str(p) for p in parts if p)
    if full:
        queries.append(full)
    if line1 and city and state:
        queries.append(f'{line1}, {city}, {state} {postal}, {country}'.strip())
    if city and state:
        queries.append(f'{city}, {state} {postal}, United States'.strip())
        queries.append(f'{city}, {state}, USA')
    if postal:
        queries.append(f'{postal}, United States')
    return queries


def geocode_location_row(loc: dict):
    """Build a query string from Location columns and return (lat, lon) or (None, None)."""
    if not loc:
        return None, None
    return geocode_from_query_list(_pickup_geocode_queries(loc))


def geocode_delivery_address(addr: dict):
    """Geocode renter delivery address dict; return (lat, lon) or (None, None)."""
    if not addr:
        return None, None
    return geocode_from_query_list(_delivery_geocode_queries(addr))


def parse_calendar_date(val):
    """Parse API date: YYYY-MM-DD or ISO datetime → date."""
    if val is None:
        raise ValueError('Missing date')
    s = str(val).strip()
    if len(s) >= 10 and s[4] == '-' and s[7] == '-':
        try:
            return datetime.strptime(s[:10], '%Y-%m-%d').date()
        except ValueError:
            pass
    dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
    if dt.tzinfo is not None:
        dt = dt.astimezone()
    return dt.date()


def booking_datetimes(start_raw, end_raw):
    """Naive datetimes for Supabase/Postgres TIMESTAMP: start at 00:00, end at 23:59:59."""
    s_date = parse_calendar_date(start_raw)
    e_date = parse_calendar_date(end_raw)
    if e_date < s_date:
        raise ValueError('End date must be on or after start date')
    start_dt = datetime.combine(s_date, datetime.min.time())
    end_dt = datetime.combine(e_date, time(23, 59, 59))
    return start_dt, end_dt


def compute_booking_totals(days, price_per_day, delivery_miles, has_delivery):
    rental_base = round(float(days) * float(price_per_day), 2)
    commission = round(rental_base * PLATFORM_COMMISSION_RATE, 2)
    booking_fee = BOOKING_FEE_USD
    miles = float(delivery_miles or 0)
    delivery_fee = round(miles * DELIVERY_USD_PER_MILE, 2) if has_delivery else 0.0
    subtotal_before_tax = round(rental_base + commission + booking_fee + delivery_fee, 2)
    tax = round(subtotal_before_tax * SALES_TAX_RATE, 2)
    total = round(subtotal_before_tax + tax, 2)
    return {
        'rental_days': int(days),
        'rental_subtotal': rental_base,
        'platform_commission': commission,
        'booking_fee': booking_fee,
        'delivery_miles': round(miles, 2) if has_delivery else 0.0,
        'delivery_fee': delivery_fee,
        'subtotal_before_tax': subtotal_before_tax,
        'tax': tax,
        'tax_rate': SALES_TAX_RATE,
        'total': total,
    }


def insert_revenue_for_completed_payment(cursor, payment_id, breakdown):
    """Revenue row: line items + platform vs lister split (matches compute_booking_totals).

    - booking_fee: flat $5 platform fee
    - commission: 10% of rental subtotal (GoRent)
    - dropoff_fee: delivery charge ($1/mile) when applicable
    - platform_payout: commission + booking_fee + dropoff (platform share before sales tax)
    - lister_payout: subtotal_before_tax - platform_payout == total - platform_payout - tax (owner’s share)
    """
    bf = float(breakdown['booking_fee'])
    comm = float(breakdown['platform_commission'])
    drop = float(breakdown['delivery_fee'])
    subtotal_before_tax = float(breakdown['subtotal_before_tax'])
    platform_payout = round(comm + bf + drop, 2)
    # subtotal_before_tax - platform_payout == total - platform_payout - tax (rental_subtotal).
    lister_payout = round(subtotal_before_tax - platform_payout, 2)
    # Use server NOW() so Supabase stores a proper TIMESTAMP.
    cursor.execute(
        """INSERT INTO Revenue (payment_id, booking_fee, commission, dropoff_fee, platform_payout, lister_payout, payout_date)
           VALUES (%s, %s, %s, %s, %s, %s, NOW())""",
        (payment_id, bf, comm, drop, platform_payout, lister_payout),
    )
    return cursor.lastrowid


def _purge_listings_for_vehicle(cursor, vehicle_id):
    """
    Delete all listings for a vehicle and dependent bookings/payments/revenue rows.
    Must run inside an open transaction (caller commits).
    """
    cursor.execute('SELECT listing_id FROM Listing WHERE vehicle_id = %s', (vehicle_id,))
    listing_ids = [r[0] for r in cursor.fetchall()]
    if not listing_ids:
        return
    ph = ','.join(['%s'] * len(listing_ids))
    cursor.execute(f'SELECT booking_id FROM Booking WHERE listing_id IN ({ph})', listing_ids)
    booking_ids = [r[0] for r in cursor.fetchall()]
    if booking_ids:
        bph = ','.join(['%s'] * len(booking_ids))
        cursor.execute(f'SELECT payment_id FROM Payment WHERE booking_id IN ({bph})', booking_ids)
        payment_ids = [r[0] for r in cursor.fetchall()]
        if payment_ids:
            pph = ','.join(['%s'] * len(payment_ids))
            cursor.execute(f'DELETE FROM Revenue WHERE payment_id IN ({pph})', payment_ids)
        cursor.execute(f'DELETE FROM Payment WHERE booking_id IN ({bph})', booking_ids)
        cursor.execute(f'DELETE FROM Booking WHERE listing_id IN ({ph})', listing_ids)
    cursor.execute('DELETE FROM Listing WHERE vehicle_id = %s', (vehicle_id,))


def _purge_listing(cursor, listing_id):
    """
    Delete one listing and dependent bookings/payments/revenue rows.
    Must run inside an open transaction (caller commits).
    """
    cursor.execute('SELECT location_id FROM Listing WHERE listing_id = %s', (listing_id,))
    row = cursor.fetchone()
    if not row:
        return False
    location_id = row[0] if not isinstance(row, dict) else row['location_id']

    cursor.execute('SELECT booking_id FROM Booking WHERE listing_id = %s', (listing_id,))
    booking_ids = [r[0] if not isinstance(r, dict) else r['booking_id'] for r in cursor.fetchall()]
    if booking_ids:
        bph = ','.join(['%s'] * len(booking_ids))
        cursor.execute(f'SELECT payment_id FROM Payment WHERE booking_id IN ({bph})', booking_ids)
        payment_ids = [r[0] if not isinstance(r, dict) else r['payment_id'] for r in cursor.fetchall()]
        if payment_ids:
            pph = ','.join(['%s'] * len(payment_ids))
            cursor.execute(f'DELETE FROM Revenue WHERE payment_id IN ({pph})', payment_ids)
        cursor.execute(f'DELETE FROM Payment WHERE booking_id IN ({bph})', booking_ids)
        cursor.execute('DELETE FROM Booking WHERE listing_id = %s', (listing_id,))

    cursor.execute('DELETE FROM Listing WHERE listing_id = %s', (listing_id,))
    cursor.execute('SELECT listing_id FROM Listing WHERE location_id = %s LIMIT 1', (location_id,))
    if cursor.fetchone() is None:
        cursor.execute('DELETE FROM Location WHERE location_id = %s', (location_id,))
    return True


def _jsonable_row(row):
    """Convert database DECIMAL and similar types for JSON responses."""
    if row is None:
        return None
    if isinstance(row, list):
        return [_jsonable_row(r) for r in row]
    if isinstance(row, dict):
        out = {}
        for k, v in row.items():
            if isinstance(v, Decimal):
                out[k] = float(v)
            else:
                out[k] = v
        return out
    if isinstance(row, Decimal):
        return float(row)
    return row


def _looks_like_werkzeug_or_standard_hash(value: str) -> bool:
    """True if stored value looks like a real password hash (not a coursework plaintext password)."""
    if not value or not isinstance(value, str):
        return False
    v = value.strip()
    return (
        v.startswith('pbkdf2:')
        or v.startswith('scrypt:')
        or v.startswith('argon2')
        or v.startswith('$2a$')
        or v.startswith('$2b$')
        or v.startswith('$2y$')
    )


def verify_password(stored_hash: str, password: str) -> bool:
    """
    Verify login password. Supports Werkzeug hashes from /api/auth/register and
    plaintext values in hand-seeded rows (e.g. password_hash column literally 'hash1').
    """
    if stored_hash is None or password is None:
        return False
    stored_hash = str(stored_hash)
    password = str(password)
    try:
        if check_password_hash(stored_hash, password):
            return True
    except (ValueError, TypeError):
        pass
    if _looks_like_werkzeug_or_standard_hash(stored_hash):
        return False
    try:
        return secrets.compare_digest(stored_hash, password)
    except (ValueError, TypeError):
        return False


def get_db_connection():
    """Create and return a Supabase/Postgres database connection."""
    try:
        if SUPABASE_DB_URL:
            connection = psycopg2.connect(SUPABASE_DB_URL, sslmode=SUPABASE_SSLMODE)
        else:
            if not db_config.get('host') or not db_config.get('user') or not db_config.get('password'):
                env_file = _BACKEND_DIR / '.env'
                print(
                    'Supabase misconfigured: set SUPABASE_DB_URL, or set '
                    'SUPABASE_DB_HOST, SUPABASE_DB_USER, SUPABASE_DB_PASSWORD, and SUPABASE_DB_NAME. '
                    f'Expected env file: {env_file} (copy from .env.example).'
                )
                return None
            connection = psycopg2.connect(**db_config)
        return SupabaseConnection(connection)
    except Error as e:
        print(f"Error connecting to Supabase/Postgres: {e}")
        return None

def token_required(f):
    """Decorator to check if user is authenticated"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            token = token.split(' ')[1] if ' ' in token else token
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user_id = int(data['user_id'])
            current_user_role = data['role']
        except Exception:
            return jsonify({'error': 'Token is invalid'}), 401
        
        return f(current_user_id, current_user_role, *args, **kwargs)
    return decorated


def assert_user_exists(cursor, user_id):
    """Abort request if user_id is missing from User (stale JWT after DB reset, env mismatch)."""
    uid = int(user_id)
    cursor.execute('SELECT user_id FROM User WHERE user_id = %s', (uid,))
    return cursor.fetchone() is not None


def _public_storage_url(object_path: str) -> str:
    encoded_path = '/'.join(urllib.parse.quote(part) for part in object_path.split('/'))
    return f'{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{encoded_path}'


def upload_image_to_supabase(file_storage, owner_user_id):
    """Upload an image to Supabase Storage and return its public URL."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError('Image uploads are not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')

    filename = secure_filename(file_storage.filename or '')
    if not filename:
        raise ValueError('Choose an image file to upload.')

    content_type = (file_storage.mimetype or '').lower()
    if content_type not in ALLOWED_UPLOAD_MIME_TYPES:
        raise ValueError('Upload a JPG, PNG, WebP, or GIF image.')

    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size <= 0:
        raise ValueError('The selected image is empty.')
    if size > MAX_UPLOAD_BYTES:
        raise ValueError('Image must be 5 MB or smaller.')

    ext = Path(filename).suffix.lower()
    object_path = f'vehicles/{int(owner_user_id)}/{secrets.token_urlsafe(16)}{ext}'
    upload_url = f'{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{object_path}'
    headers = {
        'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': content_type,
        'x-upsert': 'false',
    }
    response = requests.post(upload_url, headers=headers, data=file_storage.stream, timeout=60)
    if response.status_code not in (200, 201):
        try:
            detail = response.json().get('message') or response.text
        except Exception:
            detail = response.text
        raise ValueError(f'Supabase Storage upload failed: {detail}')

    return _public_storage_url(object_path)

# ==================== AUTHENTICATION ROUTES ====================

@app.route('/api/auth/register', methods=['POST'])
def register():
    """User registration endpoint"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        email = data.get('email')
        phone_number = data.get('phone_number', '')
        password = data.get('password')
        role = data.get('role', 'renter')
        
        if not all([first_name, last_name, email, password]):
            return jsonify({'error': 'Missing required fields: first_name, last_name, email, password'}), 400
        
        if role not in ['renter', 'owner']:
            role = 'renter'
        
        password_hash = generate_password_hash(password)
        
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO User (first_name, last_name, email, phone_number, password_hash, role) VALUES (%s, %s, %s, %s, %s, %s)",
            (first_name, last_name, email, phone_number, password_hash, role)
        )
        connection.commit()
        user_id = cursor.lastrowid
        cursor.close()
        
        return jsonify({'user_id': user_id, 'message': 'User registered successfully'}), 201
    except Error as e:
        connection.rollback()
        if 'Duplicate entry' in str(e):
            return jsonify({'error': 'Email already exists'}), 400
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login endpoint"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        email = (data.get('email') or data.get('username') or '').strip()
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT user_id, email, password_hash, first_name, last_name, role FROM User WHERE LOWER(TRIM(email)) = LOWER(TRIM(%s))",
            (email,),
        )
        user = cursor.fetchone()
        cursor.close()
        
        if not user or not verify_password(user['password_hash'], password):
            return jsonify({'error': 'incorrect username or password.'}), 401
        
        # Generate JWT token with user role
        raw_token = jwt.encode({
            'user_id': user['user_id'],
            'role': user['role'],
            'exp': datetime.utcnow() + timedelta(hours=24)
        }, app.config['SECRET_KEY'], algorithm='HS256')
        token = raw_token if isinstance(raw_token, str) else raw_token.decode('utf-8')
        
        return jsonify({
            'token': token,
            'user_id': user['user_id'],
            'role': user['role'],
            'first_name': user['first_name'],
            'last_name': user['last_name'],
            'message': 'Login successful'
        }), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# ==================== LISTING ROUTES ====================

@app.route('/api/listings', methods=['GET'])
def get_all_listings():
    """Fetch listings shown on the home/listings pages.

    Public catalog shows rows where the vehicle is marked available (Listing.availability_status
    may still say unavailable from legacy seeds — vehicle_status is the source of truth for browse).

    Display image prefers Vehicle.image, then Listing.image_url (see image_url / vehicle_image columns).
    Catalog rows use LEFT JOIN User so a listing still appears if owner_user_id is orphaned (bad seed data).
    """
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        query = """
        SELECT 
            l.listing_id,
            l.vehicle_id,
            l.location_id,
            l.price_per_day,
            l.description,
            l.image_url AS listing_image_url,
            v.image AS vehicle_image,
            CASE
                WHEN v.image IS NOT NULL AND CHAR_LENGTH(TRIM(v.image)) > 0 THEN TRIM(v.image)
                WHEN l.image_url IS NOT NULL AND CHAR_LENGTH(TRIM(l.image_url)) > 0 THEN TRIM(l.image_url)
                ELSE NULL
            END AS image_url,
            v.make,
            v.model,
            v.year,
            v.mileage,
            v.color,
            loc.city,
            loc.state_region,
            loc.address_line1,
            u.first_name as owner_first_name,
            u.last_name as owner_last_name,
            u.user_id as owner_user_id
        FROM Listing l
        JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
        JOIN Location loc ON l.location_id = loc.location_id
        LEFT JOIN User u ON v.owner_user_id = u.user_id
        WHERE LOWER(TRIM(COALESCE(v.vehicle_status, ''))) = 'available'
        """
        cursor.execute(query)
        listings = cursor.fetchall()
        cursor.close()
        return jsonify(_jsonable_row(listings)), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

@app.route('/api/listings/<int:listing_id>', methods=['GET'])
def get_listing_by_id(listing_id):
    """Fetch a single listing with car and owner details"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        query = """
        SELECT 
            l.listing_id,
            l.vehicle_id,
            l.location_id,
            l.price_per_day,
            l.description,
            l.image_url AS listing_image_url,
            v.image AS vehicle_image,
            CASE
                WHEN v.image IS NOT NULL AND CHAR_LENGTH(TRIM(v.image)) > 0 THEN TRIM(v.image)
                WHEN l.image_url IS NOT NULL AND CHAR_LENGTH(TRIM(l.image_url)) > 0 THEN TRIM(l.image_url)
                ELSE NULL
            END AS image_url,
            v.make,
            v.model,
            v.year,
            v.mileage,
            v.color,
            v.vin,
            v.license_plate,
            v.vehicle_status,
            loc.city,
            loc.state_region,
            loc.address_line1,
            loc.address_line2,
            loc.postal_code,
            loc.country,
            u.first_name as owner_first_name,
            u.last_name as owner_last_name,
            u.email as owner_email,
            u.phone_number as owner_phone,
            u.user_id as owner_user_id
        FROM Listing l
        JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
        JOIN Location loc ON l.location_id = loc.location_id
        JOIN User u ON v.owner_user_id = u.user_id
        WHERE l.listing_id = %s
        """
        cursor.execute(query, (listing_id,))
        listing = cursor.fetchone()
        cursor.close()
        
        if not listing:
            return jsonify({'error': 'Listing not found'}), 404
        
        return jsonify(_jsonable_row(listing)), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()


@app.route('/api/uploads/vehicle-image', methods=['POST'])
@token_required
def upload_vehicle_image(current_user_id, current_user_role):
    """Upload an owner vehicle/listing image to Supabase Storage and return a public URL."""
    if current_user_role != 'owner':
        return jsonify({'error': 'Only owners can upload vehicle images'}), 403

    file_storage = request.files.get('file')
    if not file_storage:
        return jsonify({'error': 'Missing file field'}), 400

    try:
        image_url = upload_image_to_supabase(file_storage, current_user_id)
        return jsonify({'image_url': image_url}), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/listings', methods=['POST'])
@token_required
def create_listing(current_user_id, current_user_role):
    """Create a new car listing (owners only).

    Send vehicle_id to attach a new pickup location + listing to an existing vehicle you own.
    Omit vehicle_id to create a new Vehicle + Location + Listing in one step.
    """
    if current_user_role != 'owner':
        return jsonify({'error': 'Only owners can create listings'}), 403
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        price_per_day = data.get('price_per_day')
        description = data.get('description', '')
        image_url = data.get('image_url', '')
        vehicle_image = (data.get('vehicle_image') or data.get('image') or image_url or '').strip()
        
        address_line1 = data.get('address_line1')
        address_line2 = data.get('address_line2', '')
        city = data.get('city')
        state_region = data.get('state_region')
        postal_code = data.get('postal_code')
        country = data.get('country', 'USA')
        
        cursor = connection.cursor()
        existing_vehicle_id = data.get('vehicle_id')
        
        if existing_vehicle_id is not None and str(existing_vehicle_id).strip() != '':
            try:
                vehicle_id = int(existing_vehicle_id)
            except (TypeError, ValueError):
                cursor.close()
                return jsonify({'error': 'Invalid vehicle_id'}), 400
            
            cursor.execute(
                'SELECT owner_user_id FROM Vehicle WHERE vehicle_id = %s',
                (vehicle_id,),
            )
            row = cursor.fetchone()
            if not row:
                cursor.close()
                return jsonify({'error': 'Vehicle not found'}), 404
            if row[0] != current_user_id:
                cursor.close()
                return jsonify({'error': 'You do not own this vehicle'}), 403

            cursor.execute(
                'SELECT listing_id FROM Listing WHERE vehicle_id = %s',
                (vehicle_id,),
            )
            existing_listing = cursor.fetchone()
            if existing_listing:
                cursor.close()
                return jsonify({'error': 'This vehicle already has a listing.'}), 409
            
            if not all([price_per_day, address_line1, city, state_region, postal_code]):
                cursor.close()
                return jsonify({'error': 'Missing required fields for listing'}), 400
            
            if vehicle_image:
                cursor.execute(
                    'UPDATE Vehicle SET image = COALESCE(NULLIF(TRIM(%s), \'\'), image) WHERE vehicle_id = %s',
                    (vehicle_image, vehicle_id),
                )
        else:
            vin = data.get('vin')
            license_plate = data.get('license_plate')
            make = data.get('make')
            model = data.get('model')
            year = data.get('year')
            color = data.get('color', '')
            mileage = data.get('mileage')
            
            if not all([vin, license_plate, make, model, year, price_per_day, address_line1, city, state_region, postal_code]):
                cursor.close()
                return jsonify({'error': 'Missing required fields'}), 400
            
            cursor.execute(
                """INSERT INTO Location (address_line1, address_line2, city, state_region, postal_code, country)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (address_line1, address_line2, city, state_region, postal_code, country),
            )
            location_id = cursor.lastrowid
            
            cursor.execute(
                """INSERT INTO Vehicle (owner_user_id, vin, license_plate, make, model, year, color, mileage, vehicle_status, image)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    current_user_id,
                    vin,
                    license_plate,
                    make,
                    model,
                    year,
                    color,
                    mileage,
                    data.get('vehicle_status', 'available'),
                    vehicle_image or None,
                ),
            )
            vehicle_id = cursor.lastrowid
            
            cursor.execute(
                """INSERT INTO Listing (vehicle_id, location_id, price_per_day, description, image_url, availability_status)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (vehicle_id, location_id, price_per_day, description, image_url, 'available'),
            )
            listing_id = cursor.lastrowid
            
            connection.commit()
            cursor.close()
            
            return jsonify({'listing_id': listing_id, 'vehicle_id': vehicle_id, 'message': 'Listing created successfully'}), 201
        
        cursor.execute(
            """INSERT INTO Location (address_line1, address_line2, city, state_region, postal_code, country)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (address_line1, address_line2, city, state_region, postal_code, country),
        )
        location_id = cursor.lastrowid
        
        cursor.execute(
            """INSERT INTO Listing (vehicle_id, location_id, price_per_day, description, image_url, availability_status)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (vehicle_id, location_id, price_per_day, description, image_url, 'available'),
        )
        listing_id = cursor.lastrowid
        
        connection.commit()
        cursor.close()
        
        return jsonify({'listing_id': listing_id, 'vehicle_id': vehicle_id, 'message': 'Listing created successfully'}), 201
    except Error as e:
        connection.rollback()
        error_text = str(e)
        if getattr(e, 'pgcode', None) == '23505' or 'Duplicate entry' in error_text:
            if 'listing_vehicle_id_unique' in error_text or 'Listing_vehicle_id_key' in error_text:
                return jsonify({'error': 'This vehicle already has a listing.'}), 409
            return jsonify({'error': 'VIN, license plate, or listing already exists'}), 400
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()


@app.route('/api/listings/<int:listing_id>', methods=['PUT'])
@token_required
def update_listing(current_user_id, current_user_role, listing_id):
    """Update an owner's listing, pickup location, and vehicle details."""
    if current_user_role != 'owner':
        return jsonify({'error': 'Only owners can update listings'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    price_per_day = data.get('price_per_day')
    address_line1 = data.get('address_line1')
    city = data.get('city')
    state_region = data.get('state_region')
    postal_code = data.get('postal_code')
    vin = data.get('vin')
    license_plate = data.get('license_plate')
    make = data.get('make')
    model = data.get('model')
    year = data.get('year')

    if not all([price_per_day, address_line1, city, state_region, postal_code, vin, license_plate, make, model, year]):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        price = float(price_per_day)
        if price < 0:
            return jsonify({'error': 'Price per day must be 0 or greater'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Price per day must be a valid number'}), 400

    try:
        year_value = int(year)
    except (TypeError, ValueError):
        return jsonify({'error': 'Year must be a valid number'}), 400

    mileage_raw = data.get('mileage')
    mileage = None
    if mileage_raw is not None and str(mileage_raw).strip() != '':
        try:
            mileage = int(mileage_raw)
            if mileage < 0:
                return jsonify({'error': 'Mileage must be 0 or greater'}), 400
        except (TypeError, ValueError):
            return jsonify({'error': 'Mileage must be a valid number'}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """SELECT l.listing_id, l.vehicle_id, l.location_id
               FROM Listing l
               JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
               WHERE l.listing_id = %s AND v.owner_user_id = %s""",
            (listing_id, current_user_id),
        )
        listing = cursor.fetchone()
        if not listing:
            cursor.close()
            return jsonify({'error': 'Listing not found or unauthorized'}), 404

        description = data.get('description', '')
        image_url = (data.get('image_url') or '').strip()
        vehicle_image = (data.get('vehicle_image') or data.get('image') or image_url or '').strip()

        cursor.execute(
            """UPDATE Location
               SET address_line1 = %s,
                   address_line2 = %s,
                   city = %s,
                   state_region = %s,
                   postal_code = %s,
                   country = %s
               WHERE location_id = %s""",
            (
                address_line1,
                data.get('address_line2', ''),
                city,
                state_region,
                postal_code,
                data.get('country', 'USA'),
                listing['location_id'],
            ),
        )
        cursor.execute(
            """UPDATE Vehicle
               SET vin = %s,
                   license_plate = %s,
                   make = %s,
                   model = %s,
                   year = %s,
                   color = %s,
                   mileage = %s,
                   image = %s
               WHERE vehicle_id = %s""",
            (
                vin,
                license_plate,
                make,
                model,
                year_value,
                data.get('color', ''),
                mileage,
                vehicle_image or None,
                listing['vehicle_id'],
            ),
        )
        cursor.execute(
            """UPDATE Listing
               SET price_per_day = %s,
                   description = %s,
                   image_url = %s
               WHERE listing_id = %s""",
            (price, description, image_url or None, listing_id),
        )

        connection.commit()
        cursor.close()
        return jsonify({'listing_id': listing_id, 'message': 'Listing updated successfully'}), 200
    except Error as e:
        connection.rollback()
        error_text = str(e)
        if getattr(e, 'pgcode', None) == '23505' or 'Duplicate entry' in error_text:
            return jsonify({'error': 'VIN or license plate already exists'}), 400
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()


@app.route('/api/listings/<int:listing_id>', methods=['DELETE'])
@token_required
def delete_listing(current_user_id, current_user_role, listing_id):
    """Permanently delete an owner's listing and its underlying vehicle record."""
    if current_user_role != 'owner':
        return jsonify({'error': 'Only owners can delete listings'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """SELECT l.listing_id, l.vehicle_id
               FROM Listing l
               JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
               WHERE l.listing_id = %s AND v.owner_user_id = %s""",
            (listing_id, current_user_id),
        )
        listing = cursor.fetchone()
        if not listing:
            cursor.close()
            return jsonify({'error': 'Listing not found or unauthorized'}), 404

        vehicle_id = listing['vehicle_id']
        _purge_listing(cursor, listing_id)
        cursor.execute('DELETE FROM Vehicle WHERE vehicle_id = %s AND owner_user_id = %s', (vehicle_id, current_user_id))
        connection.commit()
        cursor.close()
        return jsonify({'message': 'Listing deleted permanently'}), 200
    except Error as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()


@app.route('/api/vehicles/<int:vehicle_id>', methods=['PATCH'])
@token_required
def patch_vehicle_status(current_user_id, current_user_role, vehicle_id):
    """Set vehicle to available or unavailable. Unavailable removes all listings (and dependent bookings)."""
    if current_user_role != 'owner':
        return jsonify({'error': 'Only owners can update vehicles'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    raw_status = data.get('vehicle_status')
    if not raw_status:
        return jsonify({'error': 'vehicle_status is required'}), 400
    
    norm = str(raw_status).strip().lower()
    if norm not in ('available', 'unavailable'):
        return jsonify({'error': 'vehicle_status must be available or unavailable'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    cursor = connection.cursor()
    try:
        cursor.execute(
            'SELECT owner_user_id FROM Vehicle WHERE vehicle_id = %s',
            (vehicle_id,),
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return jsonify({'error': 'Vehicle not found'}), 404
        if row[0] != current_user_id:
            cursor.close()
            return jsonify({'error': 'You do not own this vehicle'}), 403
        
        if norm == 'unavailable':
            _purge_listings_for_vehicle(cursor, vehicle_id)
        
        cursor.execute(
            'UPDATE Vehicle SET vehicle_status = %s WHERE vehicle_id = %s',
            (norm, vehicle_id),
        )
        connection.commit()
        cursor.close()
        return jsonify({'vehicle_id': vehicle_id, 'vehicle_status': norm, 'message': 'Vehicle updated'}), 200
    except Error as e:
        connection.rollback()
        try:
            cursor.close()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# ==================== BOOKING ROUTES ====================

@app.route('/api/bookings/check-availability', methods=['POST'])
def check_availability():
    """Check if a listing is available for the given dates"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        data = request.get_json()
        listing_id = data.get('listing_id')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        
        if not all([listing_id, start_date, end_date]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        try:
            range_start, range_end = booking_datetimes(start_date, end_date)
        except ValueError as ve:
            return jsonify({'error': str(ve)}), 400
        
        cursor = connection.cursor(dictionary=True)
        # Check for overlapping bookings
        cursor.execute(
            """SELECT COUNT(*) as count FROM Booking 
               WHERE listing_id = %s 
               AND booking_status IN ('confirmed', 'pending')
               AND NOT (end_date <= %s OR start_date >= %s)""",
            (listing_id, range_start, range_end)
        )
        result = cursor.fetchone()
        cursor.close()
        
        available = result['count'] == 0
        return jsonify({'available': available}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()


@app.route('/api/listings/<int:listing_id>/availability', methods=['GET'])
def get_listing_availability(listing_id):
    """Return unavailable calendar dates for a listing in a given month."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500

    try:
        month_start, next_month_start = month_bounds(request.args.get('month', ''))
        range_start = datetime.combine(month_start, datetime.min.time())
        range_end = datetime.combine(next_month_start, datetime.min.time())

        cursor = connection.cursor(dictionary=True)
        cursor.execute('SELECT listing_id FROM Listing WHERE listing_id = %s', (listing_id,))
        if not cursor.fetchone():
            cursor.close()
            return jsonify({'error': 'Listing not found'}), 404

        cursor.execute(
            """SELECT start_date, end_date FROM Booking
               WHERE listing_id = %s
                 AND booking_status IN ('confirmed', 'pending')
                 AND NOT (end_date < %s OR start_date >= %s)
               ORDER BY start_date ASC""",
            (listing_id, range_start, range_end),
        )
        bookings = cursor.fetchall()
        cursor.close()

        unavailable = set()
        for booking in bookings:
            start_val = booking['start_date']
            end_val = booking['end_date']
            start_day = start_val.date() if hasattr(start_val, 'date') else parse_calendar_date(start_val)
            end_day = end_val.date() if hasattr(end_val, 'date') else parse_calendar_date(end_val)
            day = max(start_day, month_start)
            last_day = min(end_day, next_month_start - timedelta(days=1))
            while day <= last_day:
                unavailable.add(day.isoformat())
                day += timedelta(days=1)

        return jsonify(
            {
                'listing_id': listing_id,
                'month': month_start.strftime('%Y-%m'),
                'unavailable_dates': sorted(unavailable),
            }
        ), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()


@app.route('/api/bookings/delivery-quote', methods=['POST'])
def delivery_quote():
    """Return driving-distance miles and delivery fee for a listing pickup → delivery address (no auth)."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        listing_id = data.get('listing_id')
        delivery_address = data.get('delivery_address') or {}
        if not listing_id:
            return jsonify({'error': 'listing_id is required'}), 400
        line1 = (delivery_address.get('address_line1') or '').strip()
        city = (delivery_address.get('city') or '').strip()
        state = (delivery_address.get('state_region') or '').strip()
        postal = (delivery_address.get('postal_code') or '').strip()
        if not line1 or not city or not state or not postal:
            return jsonify({'error': 'Delivery requires street, city, state, and postal code.'}), 400

        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """SELECT l.location_id FROM Listing l WHERE l.listing_id = %s""",
            (listing_id,),
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return jsonify({'error': 'Listing not found'}), 404

        cursor.execute(
            """SELECT address_line1, address_line2, city, state_region, postal_code, country
               FROM Location WHERE location_id = %s""",
            (row['location_id'],),
        )
        pickup = cursor.fetchone()
        cursor.close()

        plat, plon = geocode_location_row(pickup)
        dlat, dlon = geocode_delivery_address(delivery_address)
        if plat is None or plon is None or dlat is None or dlon is None:
            return jsonify({'error': 'Could not verify addresses for delivery. Check the address or try again.'}), 400

        distance = calculate_distance(plat, plon, dlat, dlon)
        if distance > 50:
            return jsonify({'error': f'Delivery location is {distance:.1f} miles away. Must be within 50 miles.'}), 400

        delivery_fee = round(float(distance) * DELIVERY_USD_PER_MILE, 2)
        return jsonify({'miles': round(float(distance), 2), 'delivery_fee': delivery_fee}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()


def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two coordinates in miles"""
    try:
        coord1 = (lat1, lon1)
        coord2 = (lat2, lon2)
        distance = geodesic(coord1, coord2).miles
        return distance
    except Exception:
        return float('inf')


def inclusive_rental_days(start_raw, end_raw):
    """Inclusive calendar-day count for pricing (same-day = 1 day)."""
    s_date = parse_calendar_date(start_raw)
    e_date = parse_calendar_date(end_raw)
    return max(1, (e_date - s_date).days + 1)


def month_bounds(month_raw):
    """Return first day and first day of next month for a YYYY-MM month string."""
    raw = (month_raw or '').strip()
    try:
        first = datetime.strptime(raw, '%Y-%m').date()
    except ValueError:
        raise ValueError('month must use YYYY-MM format')
    if first.month == 12:
        next_first = first.replace(year=first.year + 1, month=1)
    else:
        next_first = first.replace(month=first.month + 1)
    return first, next_first


def _resolve_delivery_location_id(cursor, listing_location_id, has_delivery, delivery_address):
    """Insert delivery Location row if needed; validate <= 50 miles via geocoding.

    Returns (location_id or None, distance_miles as float). distance_miles is 0 when no delivery.
    """
    if not has_delivery or not delivery_address:
        return None, 0.0
    line1 = (delivery_address.get('address_line1') or '').strip()
    city = (delivery_address.get('city') or '').strip()
    state = (delivery_address.get('state_region') or '').strip()
    postal = (delivery_address.get('postal_code') or '').strip()
    if not line1 or not city or not state or not postal:
        raise ValueError('Delivery requires street, city, state, and postal code.')

    cursor.execute(
        """SELECT address_line1, address_line2, city, state_region, postal_code, country
           FROM Location WHERE location_id = %s""",
        (listing_location_id,),
    )
    pickup = cursor.fetchone()
    if not pickup:
        raise ValueError('Listing pickup location not found.')

    plat, plon = geocode_location_row(pickup)
    dlat, dlon = geocode_delivery_address(delivery_address)
    if plat is None or plon is None or dlat is None or dlon is None:
        raise ValueError('Could not verify addresses for delivery. Check the address or try again.')

    distance = calculate_distance(plat, plon, dlat, dlon)
    if distance > 50:
        raise ValueError(f'Delivery location is {distance:.1f} miles away. Must be within 50 miles.')

    cursor.execute(
        """INSERT INTO Location (address_line1, address_line2, city, state_region, postal_code, country)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (
            line1,
            (delivery_address.get('address_line2') or '').strip(),
            city,
            state,
            postal,
            (delivery_address.get('country') or 'USA').strip(),
        ),
    )
    return cursor.lastrowid, float(distance)


@app.route('/api/bookings/pay', methods=['POST'])
@token_required
def pay_and_book(current_user_id, current_user_role):
    """Atomically create booking + completed payment so dates are blocked for others."""
    if current_user_role != 'renter':
        return jsonify({'error': 'Only renters can book vehicles'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500

    cursor = None
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        listing_id = data.get('listing_id')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        has_delivery = bool(data.get('has_delivery'))
        delivery_address = data.get('delivery_address') or {}
        payment_method = data.get('payment_method', 'credit_card')
        transaction_reference = data.get('transaction_reference') or f'pay-{int(datetime.utcnow().timestamp())}'

        if not all([listing_id, start_date, end_date]):
            return jsonify({'error': 'Missing required fields'}), 400

        try:
            range_start, range_end = booking_datetimes(start_date, end_date)
        except ValueError as ve:
            return jsonify({'error': str(ve)}), 400

        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)

        if not assert_user_exists(cursor, current_user_id):
            connection.rollback()
            return jsonify(
                {
                    'error': 'Your account was not found in the database. Sign out and log in again '
                    '(common after resetting or switching databases).',
                }
            ), 401

        cursor.execute(
            """SELECT l.listing_id, l.location_id, l.price_per_day
               FROM Listing l WHERE l.listing_id = %s""",
            (listing_id,),
        )
        listing = cursor.fetchone()
        if not listing:
            connection.rollback()
            return jsonify({'error': 'Listing not found'}), 404

        cursor.execute(
            """SELECT COUNT(*) AS cnt FROM Booking
               WHERE listing_id = %s
                 AND booking_status IN ('confirmed', 'pending')
                 AND NOT (end_date <= %s OR start_date >= %s)""",
            (listing_id, range_start, range_end),
        )
        if cursor.fetchone()['cnt'] > 0:
            connection.rollback()
            return jsonify({'error': 'This listing has conflicting bookings for the selected dates'}), 409

        delivery_location_id = None
        delivery_miles = 0.0
        if has_delivery:
            try:
                delivery_location_id, delivery_miles = _resolve_delivery_location_id(
                    cursor, listing['location_id'], True, delivery_address
                )
            except ValueError as ve:
                connection.rollback()
                return jsonify({'error': str(ve)}), 400

        days = inclusive_rental_days(start_date, end_date)
        breakdown = compute_booking_totals(days, listing['price_per_day'], delivery_miles, has_delivery)
        total_amount = breakdown['total']

        cursor.execute(
            """INSERT INTO Booking (listing_id, renter_user_id, start_date, end_date, booking_status, total_amount, delivery_location_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (
                listing_id,
                current_user_id,
                range_start,
                range_end,
                'confirmed',
                total_amount,
                delivery_location_id,
            ),
        )
        booking_id = cursor.lastrowid

        cursor.execute(
            """INSERT INTO Payment (booking_id, amount, payment_method, payment_status, transaction_reference)
               VALUES (%s, %s, %s, %s, %s)""",
            (booking_id, total_amount, payment_method, 'completed', transaction_reference),
        )
        payment_id = cursor.lastrowid

        revenue_id = insert_revenue_for_completed_payment(cursor, payment_id, breakdown)

        connection.commit()
        return (
            jsonify(
                {
                    'booking_id': booking_id,
                    'payment_id': payment_id,
                    'revenue_id': revenue_id,
                    'total_amount': total_amount,
                    'breakdown': _jsonable_row(breakdown),
                    'message': 'Booking confirmed and payment recorded',
                }
            ),
            201,
        )
    except Error as e:
        try:
            connection.rollback()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if connection:
            try:
                connection.autocommit = True
                connection.close()
            except Exception:
                pass


@app.route('/api/bookings', methods=['POST'])
@token_required
def create_booking(current_user_id, current_user_role):
    """Create a booking without payment (pending). Prefer /api/bookings/pay for checkout."""
    if current_user_role != 'renter':
        return jsonify({'error': 'Only renters can create bookings'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        listing_id = data.get('listing_id')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        has_delivery = data.get('has_delivery', False)
        delivery_address = data.get('delivery_address', {})

        if not all([listing_id, start_date, end_date]):
            return jsonify({'error': 'Missing required fields'}), 400

        try:
            range_start, range_end = booking_datetimes(start_date, end_date)
        except ValueError as ve:
            return jsonify({'error': str(ve)}), 400

        cursor = connection.cursor(dictionary=True)

        if not assert_user_exists(cursor, current_user_id):
            cursor.close()
            return jsonify(
                {
                    'error': 'Your account was not found in the database. Sign out and log in again '
                    '(common after resetting or switching databases).',
                }
            ), 401

        cursor.execute(
            """SELECT l.location_id, l.price_per_day, l.vehicle_id
               FROM Listing l WHERE l.listing_id = %s""",
            (listing_id,),
        )
        listing = cursor.fetchone()

        if not listing:
            cursor.close()
            return jsonify({'error': 'Listing not found'}), 404

        cursor.execute(
            """SELECT COUNT(*) as count FROM Booking
               WHERE listing_id = %s
                 AND booking_status IN ('confirmed', 'pending')
                 AND NOT (end_date <= %s OR start_date >= %s)""",
            (listing_id, range_start, range_end),
        )
        conflict = cursor.fetchone()

        if conflict['count'] > 0:
            cursor.close()
            return jsonify({'error': 'This listing has conflicting bookings for the selected dates'}), 409

        delivery_location_id = None
        delivery_miles = 0.0
        if has_delivery and delivery_address:
            try:
                delivery_location_id, delivery_miles = _resolve_delivery_location_id(
                    cursor, listing['location_id'], True, delivery_address
                )
            except ValueError as ve:
                cursor.close()
                return jsonify({'error': str(ve)}), 400

        days = inclusive_rental_days(start_date, end_date)
        breakdown = compute_booking_totals(days, listing['price_per_day'], delivery_miles, bool(has_delivery and delivery_address))
        total_amount = breakdown['total']

        cursor.execute(
            """INSERT INTO Booking (listing_id, renter_user_id, start_date, end_date, booking_status, total_amount, delivery_location_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (
                listing_id,
                current_user_id,
                range_start,
                range_end,
                'pending',
                total_amount,
                delivery_location_id,
            ),
        )
        booking_id = cursor.lastrowid

        connection.commit()
        cursor.close()

        return jsonify(
            {
                'booking_id': booking_id,
                'total_amount': total_amount,
                'breakdown': _jsonable_row(breakdown),
                'message': 'Booking created successfully',
            }
        ), 201
    except Error as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

@app.route('/api/bookings', methods=['GET'])
@token_required
def get_bookings(current_user_id, current_user_role):
    """Get bookings for the current user"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        if current_user_role == 'renter':
            # Get renter's past and upcoming bookings
            query = """
            SELECT 
                b.booking_id,
                b.start_date,
                b.end_date,
                b.total_amount,
                b.booking_status,
                v.make,
                v.model,
                v.year,
                loc.city,
                loc.state_region
            FROM Booking b
            JOIN Listing l ON b.listing_id = l.listing_id
            JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
            JOIN Location loc ON l.location_id = loc.location_id
            WHERE b.renter_user_id = %s
            ORDER BY b.start_date DESC
            """
            cursor.execute(query, (current_user_id,))
        elif current_user_role == 'owner':
            # Get owner's rental history (bookings for their cars)
            query = """
            SELECT 
                b.booking_id,
                b.start_date,
                b.end_date,
                b.total_amount,
                b.booking_status,
                v.make,
                v.model,
                v.year,
                u.first_name as renter_first_name,
                u.last_name as renter_last_name,
                u.email as renter_email
            FROM Booking b
            JOIN Listing l ON b.listing_id = l.listing_id
            JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
            JOIN User u ON b.renter_user_id = u.user_id
            WHERE v.owner_user_id = %s
            ORDER BY b.start_date DESC
            """
            cursor.execute(query, (current_user_id,))
        
        bookings = cursor.fetchall()
        cursor.close()
        return jsonify(bookings), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# ==================== PAYMENT ROUTES ====================

@app.route('/api/payments', methods=['POST'])
@token_required
def create_payment(current_user_id, current_user_role):
    """Create a payment for a booking"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        booking_id = data.get('booking_id')
        amount = data.get('amount')
        payment_method = data.get('payment_method', 'credit_card')
        payment_status = data.get('payment_status', 'completed')
        transaction_reference = data.get('transaction_reference', '')
        
        if not all([booking_id, amount]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        cursor = connection.cursor()
        
        # Verify booking belongs to renter
        cursor.execute("SELECT renter_user_id FROM Booking WHERE booking_id = %s", (booking_id,))
        booking = cursor.fetchone()
        
        if not booking or booking[0] != current_user_id:
            cursor.close()
            return jsonify({'error': 'Booking not found or unauthorized'}), 404
        
        # Create payment
        cursor.execute(
            """INSERT INTO Payment (booking_id, amount, payment_method, payment_status, transaction_reference)
               VALUES (%s, %s, %s, %s, %s)""",
            (booking_id, amount, payment_method, payment_status, transaction_reference)
        )
        payment_id = cursor.lastrowid
        
        # Update booking status to confirmed if payment successful
        if payment_status == 'completed':
            cursor.execute(
                "UPDATE Booking SET booking_status = 'confirmed' WHERE booking_id = %s",
                (booking_id,)
            )
        
        connection.commit()
        cursor.close()
        
        return jsonify({
            'payment_id': payment_id,
            'message': 'Payment processed successfully'
        }), 201
    except Error as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# ==================== DASHBOARD ROUTES ====================

@app.route('/api/dashboard', methods=['GET'])
@token_required
def get_dashboard(current_user_id, current_user_role):
    """Get dashboard data based on user role"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        if current_user_role == 'owner':
            # Get owner's stats and listings
            cursor.execute(
                """SELECT COUNT(DISTINCT l.listing_id) as total_listings
                   FROM Listing l
                   JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
                   WHERE v.owner_user_id = %s""",
                (current_user_id,)
            )
            listings_count = cursor.fetchone()
            
            cursor.execute(
                """SELECT COUNT(DISTINCT b.booking_id) as total_bookings,
                        SUM(b.total_amount) as total_revenue
                   FROM Booking b
                   JOIN Listing l ON b.listing_id = l.listing_id
                   JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
                   WHERE v.owner_user_id = %s AND b.booking_status = 'confirmed'""",
                (current_user_id,)
            )
            revenue_info = cursor.fetchone()
            
            # Get owner's listings
            cursor.execute(
                """SELECT l.listing_id, l.vehicle_id, v.make, v.model, v.year, l.price_per_day,
                        loc.city, loc.state_region,
                        l.image_url AS listing_image_url,
                        v.image AS vehicle_image,
                        CASE
                            WHEN v.image IS NOT NULL AND CHAR_LENGTH(TRIM(v.image)) > 0 THEN TRIM(v.image)
                            WHEN l.image_url IS NOT NULL AND CHAR_LENGTH(TRIM(l.image_url)) > 0 THEN TRIM(l.image_url)
                            ELSE NULL
                        END AS image_url
                   FROM Listing l
                   JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
                   JOIN Location loc ON l.location_id = loc.location_id
                   WHERE v.owner_user_id = %s""",
                (current_user_id,)
            )
            listings = cursor.fetchall()
            
            cursor.execute(
                """SELECT vehicle_id, vin, license_plate, make, model, year, color, mileage, vehicle_status, image
                   FROM Vehicle WHERE owner_user_id = %s
                   ORDER BY make, model, vehicle_id""",
                (current_user_id,),
            )
            vehicles = cursor.fetchall()
            
            cursor.execute(
                """SELECT b.booking_id, b.start_date, b.end_date, b.total_amount, b.booking_status,
                          v.make, v.model, v.year, v.vehicle_id,
                          u.first_name AS renter_first_name, u.last_name AS renter_last_name,
                          l.listing_id
                   FROM Booking b
                   JOIN Listing l ON b.listing_id = l.listing_id
                   JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
                   JOIN User u ON b.renter_user_id = u.user_id
                   WHERE v.owner_user_id = %s
                   ORDER BY b.start_date DESC""",
                (current_user_id,),
            )
            owner_bookings = cursor.fetchall()
            
            cursor.close()
            
            return jsonify({
                'role': 'owner',
                'total_listings': listings_count['total_listings'] or 0,
                'total_bookings': revenue_info['total_bookings'] or 0,
                'total_revenue': float(revenue_info['total_revenue'] or 0),
                'listings': listings,
                'vehicles': _jsonable_row(vehicles),
                'bookings': _jsonable_row(owner_bookings),
            }), 200
        
        elif current_user_role == 'renter':
            # Get renter's stats and bookings
            cursor.execute(
                """SELECT COUNT(DISTINCT b.booking_id) as total_bookings
                   FROM Booking b
                   WHERE b.renter_user_id = %s""",
                (current_user_id,)
            )
            bookings_count = cursor.fetchone()
            
            cursor.execute(
                """SELECT COUNT(DISTINCT b.booking_id) as completed_bookings
                   FROM Booking b
                   WHERE b.renter_user_id = %s AND b.end_date < NOW()""",
                (current_user_id,)
            )
            completed = cursor.fetchone()
            
            # Get renter's bookings
            cursor.execute(
                """SELECT b.booking_id, b.start_date, b.end_date, b.total_amount,
                        b.booking_status, v.make, v.model, v.year,
                        loc.city, loc.state_region
                   FROM Booking b
                   JOIN Listing l ON b.listing_id = l.listing_id
                   JOIN Vehicle v ON l.vehicle_id = v.vehicle_id
                   JOIN Location loc ON l.location_id = loc.location_id
                   WHERE b.renter_user_id = %s
                   ORDER BY b.start_date DESC""",
                (current_user_id,)
            )
            bookings = cursor.fetchall()
            
            cursor.close()
            
            return jsonify({
                'role': 'renter',
                'total_bookings': bookings_count['total_bookings'] or 0,
                'completed_bookings': completed['completed_bookings'] or 0,
                'bookings': _jsonable_row(bookings),
            }), 200
        
        else:
            cursor.close()
            return jsonify({'error': 'Invalid user role'}), 400
    
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

# ==================== USER ROUTES ====================

@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user_by_id(user_id):
    """Fetch a single user by ID"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT user_id, first_name, last_name, email, phone_number, role FROM User WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        cursor.close()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        return jsonify(user), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@token_required
def update_user(current_user_id, current_user_role, user_id):
    """Update user information"""
    if current_user_id != user_id:
        return jsonify({'error': 'You can only update your own profile'}), 403
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Failed to connect to database'}), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        update_fields = []
        values = []
        for key, value in data.items():
            if key not in ['user_id', 'password_hash', 'role']:
                update_fields.append(f"{key} = %s")
                values.append(value)
        
        if not update_fields:
            return jsonify({'error': 'No fields to update'}), 400
        
        values.append(user_id)
        query = f"UPDATE User SET {', '.join(update_fields)} WHERE user_id = %s"
        
        cursor = connection.cursor()
        cursor.execute(query, values)
        connection.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'User not found'}), 404
        
        cursor.close()
        return jsonify({'message': 'User updated successfully'}), 200
    except Error as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        connection.close()

@app.route('/api/health', methods=['GET'])
def health_check():
    """Check if the backend is running"""
    connection = get_db_connection()
    if connection:
        connection.close()
        return jsonify({'status': 'healthy', 'database': 'connected'}), 200
    else:
        return jsonify({'status': 'unhealthy', 'database': 'disconnected'}), 500

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Route not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
