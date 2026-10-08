-- GoRent reporting views for CSC33600 final project
-- Run this after backend/schema.sql and stored_procedures_triggers.sql.

CREATE OR REPLACE VIEW owner_revenue_report AS
SELECT
    u.user_id AS owner_user_id,
    u.first_name AS owner_first_name,
    u.last_name AS owner_last_name,
    v.vehicle_id,
    v.make,
    v.model,
    v.year,
    l.listing_id,
    b.booking_id,
    b.start_date,
    b.end_date,
    b.booking_status,
    p.payment_id,
    p.payment_status,
    p.amount AS payment_amount,
    r.booking_fee,
    r.commission,
    r.dropoff_fee,
    r.platform_payout,
    r.lister_payout,
    r.payout_date
FROM "Revenue" r
JOIN "Payment" p ON r.payment_id = p.payment_id
JOIN "Booking" b ON p.booking_id = b.booking_id
JOIN "Listing" l ON b.listing_id = l.listing_id
JOIN "Vehicle" v ON l.vehicle_id = v.vehicle_id
JOIN "User" u ON v.owner_user_id = u.user_id;

CREATE OR REPLACE VIEW active_listing_catalog AS
SELECT
    l.listing_id,
    l.vehicle_id,
    l.price_per_day,
    l.description,
    l.availability_status,
    v.make,
    v.model,
    v.year,
    v.color,
    v.mileage,
    v.vehicle_status,
    loc.city,
    loc.state_region,
    loc.country
FROM "Listing" l
JOIN "Vehicle" v ON l.vehicle_id = v.vehicle_id
JOIN "Location" loc ON l.location_id = loc.location_id
WHERE LOWER(COALESCE(v.vehicle_status, '')) = 'available';
