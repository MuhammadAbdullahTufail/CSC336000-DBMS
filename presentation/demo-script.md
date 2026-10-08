# GoRent Final Demo Script

This script is meant to help the team present the final CSC33600 project clearly and within time.

## 1. Introduction

GoRent is a peer-to-peer car rental platform. Owners can list vehicles, renters can book cars, and the system tracks payments and revenue.

## 2. Business Idea

The platform connects people who own cars with renters who need short-term vehicle access. GoRent can generate revenue through a booking fee, commission on each rental, optional delivery fees, and future anonymized demand reports.

## 3. Tech Stack

- Frontend: Next.js
- Backend: Flask
- Database: Supabase Postgres
- Storage: Supabase Storage
- Deployment: Vercel for frontend, Render for backend
- Docker: frontend and backend containers
- CI/CD: GitHub Actions Docker image build/push workflow

## 4. Database Design and 2NF

Show `backend/schema.sql` and `docs/database-design-2nf.md`.

Main tables:

- User
- Location
- Vehicle
- Listing
- Booking
- Payment
- Revenue

Explain that the database is in 2NF because each table has a primary key, non-key attributes depend on the full key, and repeated concepts like locations, vehicles, payments, and revenue are separated into their own tables.

## 5. MVP Functionality 1: Owner Listing Flow

Steps:

1. Log in as an owner.
2. Go to the dashboard.
3. Click Add listing.
4. Add vehicle and listing information.
5. Submit the listing.
6. Show the listing in the dashboard and public catalog.

Database tables involved:

- User
- Vehicle
- Listing
- Location

## 6. MVP Functionality 2: Renter Booking and Payment Flow

Steps:

1. Log in as a renter.
2. Browse listings.
3. Select a car.
4. Choose dates.
5. Complete booking/payment.
6. Show the booking in the renter dashboard.
7. Show the booking in the owner dashboard.

Database tables involved:

- Booking
- Payment
- Revenue
- Listing
- Vehicle

## 7. Stored Procedures and Triggers

Show:

```text
backend/migrations/stored_procedures_triggers.sql
```

Stored procedures:

1. `complete_booking_payment(...)`
2. `cancel_booking_and_release_vehicle(...)`

Triggers:

1. `trg_create_revenue_for_completed_payment`
2. `trg_sync_vehicle_status_after_booking_change`

Explain that the first trigger automatically creates revenue records when payments are completed. The second trigger updates vehicle availability when booking status changes.

## 8. Revenue Reporting

Show:

```text
backend/migrations/views.sql
```

View:

```text
owner_revenue_report
```

Explain that this joins User, Vehicle, Listing, Booking, Payment, and Revenue so the team can report total payment amount, platform payout, and lister payout.

## 9. Docker and Deployment

Show:

- `Dockerfile`
- `backend/Dockerfile`
- `docker-compose.yml`
- `.github/workflows/docker.yml`

Explain that Docker Compose runs the frontend and backend together, while GitHub Actions builds and pushes Docker images to GitHub Container Registry.

## 10. Closing

GoRent demonstrates a relational database-backed full-stack application with real MVP flows, normalized data modeling, database-side automation, revenue reporting, deployment, and Docker support.
