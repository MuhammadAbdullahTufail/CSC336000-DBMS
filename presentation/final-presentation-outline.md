# Final Presentation Outline

Use this outline to build the final Google Slides or PowerPoint deck.

## Slide 1: Title

GoRent: Peer-to-Peer Car Rental Platform

Include:

- Course: CSC33600 Introduction to Database Systems
- Team number/name
- Team member names

## Slide 2: Problem

People sometimes need short-term access to a car, while car owners may have vehicles sitting unused. GoRent connects these two groups through a simple rental marketplace.

## Slide 3: Solution

GoRent lets:

- Owners list vehicles.
- Renters browse and book vehicles.
- Payments and revenue are tracked.
- Owners and renters manage activity through dashboards.

## Slide 4: User Journey

Owner journey:

1. Register/login as owner.
2. Add vehicle listing.
3. View bookings.
4. Track revenue.

Renter journey:

1. Register/login as renter.
2. Browse cars.
3. Book a car.
4. Complete payment.
5. View booking history.

## Slide 5: Tech Stack

- Next.js frontend
- Flask backend
- Supabase Postgres database
- Supabase Storage
- Docker and Docker Compose
- GitHub Actions for Docker image builds
- Vercel/Render deployment

## Slide 6: Database Schema

Show the main tables:

- User
- Location
- Vehicle
- Listing
- Booking
- Payment
- Revenue

## Slide 7: 2NF Design

Explain:

- Each table has a primary key.
- Non-key fields depend on the table key.
- Vehicle, listing, location, booking, payment, and revenue data are separated.
- Repeated data is avoided.

## Slide 8: MVP Feature 1

Owner creates and manages a listing.

Database tables involved:

- User
- Vehicle
- Location
- Listing

## Slide 9: MVP Feature 2

Renter books and pays for a vehicle.

Database tables involved:

- Booking
- Payment
- Revenue

## Slide 10: Stored Procedures and Triggers

Stored procedures:

- `complete_booking_payment(...)`
- `cancel_booking_and_release_vehicle(...)`

Triggers:

- `trg_create_revenue_for_completed_payment`
- `trg_sync_vehicle_status_after_booking_change`

## Slide 11: Revenue Reporting

Show:

- Revenue table
- `owner_revenue_report` view
- Example totals: payment amount, booking fee, commission, platform payout, lister payout

## Slide 12: Docker and Deployment

Show:

- Frontend Dockerfile
- Backend Dockerfile
- Docker Compose
- GitHub Actions Docker workflow
- Deployed app link

## Slide 13: Challenges and Improvements

Mention:

- Database connection setup
- Environment variables
- Supabase/Postgres integration
- Docker networking/API URL differences
- Future improvements: reviews, advanced search, BI dashboard, AI support

## Slide 14: Closing

GoRent demonstrates a full-stack relational database application with normalized design, live database integration, MVP user flows, revenue reporting, Docker support, and database-side automation.
