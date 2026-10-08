# GoRent Backend

This folder contains the Flask API for GoRent. The database is Supabase Postgres, and vehicle images are stored in Supabase Storage.

## Backend Files

- `app.py`: Flask API
- `requirements.txt`: Python dependencies
- `schema.sql`: Supabase/Postgres schema
- `.env.example`: backend environment template

## Required Supabase Setup

1. Open Supabase SQL Editor.
2. Run `schema.sql`.
3. Open Supabase Storage.
4. Create a public bucket named `vehicle-images`.
5. Copy the project URL, service role key, and database pooler URI.

The schema intentionally keeps the original table names:

- `"User"`
- `"Location"`
- `"Vehicle"`
- `"Listing"`
- `"Booking"`
- `"Payment"`
- `"Revenue"`

The quotes are intentional because these names are preserved exactly in Postgres.

## Environment Setup

From the repo root:

```powershell
Copy-Item backend/.env.example backend/.env
```

Fill in `backend/.env`:

```env
SECRET_KEY=make-a-long-random-secret
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
SUPABASE_SSLMODE=require
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=vehicle-images
```

Use the Supabase pooler URI for `SUPABASE_DB_URL`. This is especially important in Docker because the direct `db.<project-ref>.supabase.co:5432` endpoint can resolve to IPv6, which Docker Desktop may not reach.

Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Do not put it in frontend environment variables.

## Run Backend Without Docker

From the repo root:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
.\venv\Scripts\python.exe app.py
```

The API runs at:

```text
http://127.0.0.1:5000
```

Check it:

```powershell
curl.exe http://127.0.0.1:5000/api/health
```

Expected healthy response:

```json
{"database":"connected","status":"healthy"}
```

## Run Backend With Docker

From the repo root:

```powershell
docker compose up --build backend
```

The backend container reads `backend/.env` and exposes:

```text
http://localhost:5000
```

Check it:

```powershell
curl.exe http://localhost:5000/api/health
```

If health returns `database disconnected`, check that `SUPABASE_DB_URL` is the Supabase pooler URI.

## API Routes

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

### Listings And Vehicles

- `GET /api/listings`
- `GET /api/listings/<listing_id>`
- `POST /api/listings`
- `PUT /api/listings/<listing_id>`
- `DELETE /api/listings/<listing_id>`
- `PATCH /api/vehicles/<vehicle_id>`
- `POST /api/uploads/vehicle-image`

### Bookings And Payments

- `POST /api/bookings/check-availability`
- `GET /api/listings/<listing_id>/availability`
- `POST /api/bookings/delivery-quote`
- `POST /api/bookings/pay`
- `POST /api/bookings`
- `GET /api/bookings`
- `POST /api/payments`

### Dashboard And Users

- `GET /api/dashboard`
- `GET /api/users/<user_id>`
- `PUT /api/users/<user_id>`

### Health

- `GET /api/health`

## Deployment On Render

Create a Render Web Service with:

```text
Root Directory: backend
Runtime: Python 3
Build Command: pip install -r requirements.txt
Start Command: gunicorn --bind 0.0.0.0:$PORT app:app
```

Add the same environment variables from `backend/.env` in the Render dashboard.
