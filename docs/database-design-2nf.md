# GoRent 2NF Database Design

This document summarizes the GoRent relational database design for the CSC33600 final project.

## Project Concept

GoRent is a peer-to-peer car rental platform. Owners can list vehicles, renters can book vehicles, payments are recorded, and revenue rows track platform and owner payouts.

## Tables

### User

Stores renter and owner accounts.

Primary key: `user_id`

Important attributes:

- `first_name`
- `last_name`
- `email`
- `phone_number`
- `password_hash`
- `role`
- `created_at`

### Location

Stores pickup or delivery locations.

Primary key: `location_id`

Important attributes:

- `address_line1`
- `address_line2`
- `city`
- `state_region`
- `postal_code`
- `country`
- `latitude`
- `longitude`

### Vehicle

Stores vehicles owned by users.

Primary key: `vehicle_id`

Foreign key:

- `owner_user_id` references `User(user_id)`

Important attributes:

- `vin`
- `license_plate`
- `make`
- `model`
- `year`
- `color`
- `mileage`
- `image`
- `vehicle_status`

### Listing

Stores rental listing information for a vehicle.

Primary key: `listing_id`

Foreign keys:

- `vehicle_id` references `Vehicle(vehicle_id)`
- `location_id` references `Location(location_id)`

Important attributes:

- `price_per_day`
- `description`
- `availability_status`
- `date_posted`
- `image_url`

### Booking

Stores renter reservations.

Primary key: `booking_id`

Foreign keys:

- `listing_id` references `Listing(listing_id)`
- `renter_user_id` references `User(user_id)`
- `delivery_location_id` references `Location(location_id)`

Important attributes:

- `start_date`
- `end_date`
- `booking_status`
- `total_amount`
- `created_at`

### Payment

Stores payment records for bookings.

Primary key: `payment_id`

Foreign key:

- `booking_id` references `Booking(booking_id)`

Important attributes:

- `payment_date`
- `amount`
- `payment_method`
- `payment_status`
- `transaction_reference`

### Revenue

Stores platform and owner revenue split records.

Primary key: `revenue_id`

Foreign key:

- `payment_id` references `Payment(payment_id)`

Important attributes:

- `booking_fee`
- `commission`
- `dropoff_fee`
- `platform_payout`
- `lister_payout`
- `payout_date`

## Relationship Summary

```text
User 1 ---- many Vehicle
Vehicle 1 ---- 1 Listing
Location 1 ---- many Listing
Listing 1 ---- many Booking
User 1 ---- many Booking as renter
Booking 1 ---- many Payment
Payment 1 ---- 1 Revenue
Location 1 ---- many Booking as delivery location
```

## 2NF Explanation

The database design satisfies Second Normal Form because:

1. Each table has a single-column primary key.
2. Non-key attributes depend on the whole primary key of their table.
3. Repeating groups are separated into their own tables.
4. Vehicle details are separated from listing details.
5. Payment details are separated from booking details.
6. Revenue details are separated from payment details.
7. Location data is separated so addresses are not repeated directly across listing and booking rows.

## Text ERD

```text
+---------+       +----------+       +---------+
|  User   | 1   * | Vehicle  | 1   1 | Listing |
+---------+-------+----------+-------+---------+
    |                                  |
    |                                  | *
    |                                  |
    |                              +---------+
    |                          1   | Booking |
    |------------------------------+---------+
            renter_user_id              |
                                        | 1
                                        |
                                    +---------+
                                    | Payment |
                                    +---------+
                                        |
                                        | 1
                                        |
                                    +---------+
                                    | Revenue |
                                    +---------+

+----------+
| Location |
+----------+
   ^    ^
   |    |
Listing  Booking delivery location
```

## Indexes

The schema includes indexes for common lookup paths, including vehicle owner lookups, listing-to-vehicle lookups, booking status, booking date ranges, and payment status.

## Database-Side Logic

The final project adds stored procedures and triggers in:

```text
backend/migrations/stored_procedures_triggers.sql
```

These routines support automatic revenue creation after completed payments and vehicle status updates after booking status changes.
