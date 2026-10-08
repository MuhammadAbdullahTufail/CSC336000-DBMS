-- If Revenue.payout_date was imported with the wrong type, normalize it for Supabase/Postgres.
-- Run once against your database if needed.

ALTER TABLE "Revenue" ALTER COLUMN payout_date TYPE TIMESTAMP;
ALTER TABLE "Revenue" ALTER COLUMN payout_date DROP NOT NULL;
ALTER TABLE "Revenue" ALTER COLUMN payout_date DROP DEFAULT;
