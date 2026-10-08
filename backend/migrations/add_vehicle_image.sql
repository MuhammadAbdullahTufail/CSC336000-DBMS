-- Adds the vehicle-level photo URL used by backend/app.py.
-- Run once if your database was created before Vehicle.image existed.

ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS image VARCHAR(255);
