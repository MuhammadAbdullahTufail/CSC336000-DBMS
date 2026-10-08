"""Export GoRent revenue report rows to CSV.

Usage from the backend folder:

    python export_revenue_report.py

Optional custom output path:

    python export_revenue_report.py ../revenue-report.csv

This script uses the same Supabase/Postgres environment variables as app.py.
Run backend/schema.sql, backend/migrations/stored_procedures_triggers.sql,
and backend/migrations/views.sql before using this exporter.
"""

from __future__ import annotations

import csv
import os
import sys
from pathlib import Path
from decimal import Decimal
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv()

SUPABASE_DB_URL = (
    os.getenv("SUPABASE_DB_URL", "").strip()
    or os.getenv("DATABASE_URL", "").strip()
    or os.getenv("POSTGRES_URL", "").strip()
)
SUPABASE_SSLMODE = os.getenv("SUPABASE_SSLMODE", "require").strip() or "require"

REPORT_QUERY = """
SELECT
    owner_user_id,
    owner_first_name,
    owner_last_name,
    vehicle_id,
    make,
    model,
    year,
    listing_id,
    booking_id,
    start_date,
    end_date,
    booking_status,
    payment_id,
    payment_status,
    payment_amount,
    booking_fee,
    commission,
    dropoff_fee,
    platform_payout,
    lister_payout,
    payout_date
FROM owner_revenue_report
ORDER BY payout_date DESC NULLS LAST, payment_id DESC;
"""


def get_connection():
    if not SUPABASE_DB_URL:
        raise RuntimeError("Missing SUPABASE_DB_URL, DATABASE_URL, or POSTGRES_URL")
    return psycopg2.connect(SUPABASE_DB_URL, sslmode=SUPABASE_SSLMODE)


def csv_value(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def export_revenue_report(output_path: Path) -> int:
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(REPORT_QUERY)
            rows = cur.fetchall()

    output_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "owner_user_id",
        "owner_first_name",
        "owner_last_name",
        "vehicle_id",
        "make",
        "model",
        "year",
        "listing_id",
        "booking_id",
        "start_date",
        "end_date",
        "booking_status",
        "payment_id",
        "payment_status",
        "payment_amount",
        "booking_fee",
        "commission",
        "dropoff_fee",
        "platform_payout",
        "lister_payout",
        "payout_date",
    ]

    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: csv_value(row.get(key)) for key in fieldnames})

    return len(rows)


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else BACKEND_DIR / "revenue-report.csv"
    count = export_revenue_report(target)
    print(f"Exported {count} revenue rows to {target}")
