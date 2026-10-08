-- GoRent stored procedures and triggers for CSC33600 final project
-- Run this file after backend/schema.sql in the Supabase/Postgres SQL Editor.
-- These database-side routines support MVP functionality for payments, revenue, and booking status.

BEGIN;

-- 1) Trigger function: automatically create/update a Revenue row when a payment is completed.
CREATE OR REPLACE FUNCTION create_revenue_for_completed_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_booking_total NUMERIC(10, 2);
    v_booking_fee NUMERIC(10, 2) := 5.00;
    v_commission NUMERIC(10, 2);
    v_dropoff_fee NUMERIC(10, 2) := 0.00;
    v_platform_payout NUMERIC(10, 2);
    v_lister_payout NUMERIC(10, 2);
BEGIN
    IF LOWER(COALESCE(NEW.payment_status, '')) <> 'completed' THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(b.total_amount, NEW.amount)
    INTO v_booking_total
    FROM "Booking" b
    WHERE b.booking_id = NEW.booking_id;

    v_booking_total := COALESCE(v_booking_total, NEW.amount, 0);
    v_commission := ROUND((v_booking_total * 0.10)::NUMERIC, 2);
    v_platform_payout := ROUND((v_booking_fee + v_commission + v_dropoff_fee)::NUMERIC, 2);
    v_lister_payout := ROUND(GREATEST(v_booking_total - v_platform_payout, 0)::NUMERIC, 2);

    INSERT INTO "Revenue" (
        payment_id,
        booking_fee,
        commission,
        dropoff_fee,
        platform_payout,
        lister_payout,
        payout_date
    )
    VALUES (
        NEW.payment_id,
        v_booking_fee,
        v_commission,
        v_dropoff_fee,
        v_platform_payout,
        v_lister_payout,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_revenue_for_completed_payment ON "Payment";

CREATE TRIGGER trg_create_revenue_for_completed_payment
AFTER INSERT OR UPDATE OF payment_status, amount ON "Payment"
FOR EACH ROW
EXECUTE FUNCTION create_revenue_for_completed_payment();

-- 2) Trigger function: keep Vehicle status in sync when bookings become active or canceled.
CREATE OR REPLACE FUNCTION sync_vehicle_status_after_booking_change()
RETURNS TRIGGER AS $$
DECLARE
    v_vehicle_id INTEGER;
BEGIN
    SELECT l.vehicle_id
    INTO v_vehicle_id
    FROM "Listing" l
    WHERE l.listing_id = NEW.listing_id;

    IF v_vehicle_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF LOWER(COALESCE(NEW.booking_status, '')) IN ('pending', 'confirmed', 'completed') THEN
        UPDATE "Vehicle"
        SET vehicle_status = 'unavailable'
        WHERE vehicle_id = v_vehicle_id;
    ELSIF LOWER(COALESCE(NEW.booking_status, '')) IN ('cancelled', 'canceled') THEN
        IF NOT EXISTS (
            SELECT 1
            FROM "Booking" b
            JOIN "Listing" l ON b.listing_id = l.listing_id
            WHERE l.vehicle_id = v_vehicle_id
              AND b.booking_id <> NEW.booking_id
              AND LOWER(COALESCE(b.booking_status, '')) IN ('pending', 'confirmed', 'completed')
        ) THEN
            UPDATE "Vehicle"
            SET vehicle_status = 'available'
            WHERE vehicle_id = v_vehicle_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_vehicle_status_after_booking_change ON "Booking";

CREATE TRIGGER trg_sync_vehicle_status_after_booking_change
AFTER INSERT OR UPDATE OF booking_status ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION sync_vehicle_status_after_booking_change();

-- Stored procedure 1: mark a booking as completed and insert a completed payment.
-- The payment trigger will automatically create the Revenue row.
CREATE OR REPLACE PROCEDURE complete_booking_payment(
    p_booking_id INTEGER,
    p_payment_method VARCHAR DEFAULT 'card',
    p_transaction_reference VARCHAR DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_total NUMERIC(10, 2);
BEGIN
    SELECT total_amount
    INTO v_total
    FROM "Booking"
    WHERE booking_id = p_booking_id;

    IF v_total IS NULL THEN
        RAISE EXCEPTION 'Booking % was not found or does not have a total_amount', p_booking_id;
    END IF;

    UPDATE "Booking"
    SET booking_status = 'completed'
    WHERE booking_id = p_booking_id;

    INSERT INTO "Payment" (
        booking_id,
        amount,
        payment_method,
        payment_status,
        transaction_reference
    )
    VALUES (
        p_booking_id,
        v_total,
        p_payment_method,
        'completed',
        p_transaction_reference
    );
END;
$$;

-- Stored procedure 2: cancel a booking and release the related vehicle when no active bookings remain.
CREATE OR REPLACE PROCEDURE cancel_booking_and_release_vehicle(
    p_booking_id INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE "Booking"
    SET booking_status = 'canceled'
    WHERE booking_id = p_booking_id;
END;
$$;

COMMIT;
