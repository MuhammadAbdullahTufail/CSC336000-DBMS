-- Enforce the app rule that each vehicle can have zero or one listing.
-- Run this after removing any duplicate Listing rows for the same vehicle_id.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'listing_vehicle_id_unique'
    ) THEN
        ALTER TABLE "Listing"
        ADD CONSTRAINT listing_vehicle_id_unique UNIQUE (vehicle_id);
    END IF;
END $$;
