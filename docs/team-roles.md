# Team Roles and Group Etiquette

This document records team responsibilities and collaboration rules for the CSC33600 GoRent group project.

## Team Responsibilities

| Role | Responsibility |
| --- | --- |
| Project Coordinator | Keeps the team aligned, tracks deliverables, and organizes demo preparation. |
| Frontend Developer | Builds and maintains the Next.js pages, forms, dashboard views, and user experience. |
| Backend Developer | Builds Flask API routes, authentication, booking logic, payment logic, and database integration. |
| Database Developer | Maintains the relational schema, 2NF design, stored procedures, triggers, indexes, and reporting views. |
| DevOps / Deployment Lead | Maintains Docker, Docker Compose, GitHub Actions, and deployment documentation. |
| QA / Demo Lead | Tests MVP flows, records bugs, prepares screenshots, and coordinates final demo timing. |

## Collaboration Rules

1. Use GitHub branches for major changes.
2. Do not commit `.env`, `.env.local`, `backend/.env`, service keys, passwords, or database credentials.
3. Pull the latest changes before starting work.
4. Use clear commit messages that describe the actual change.
5. Review schema changes before merging because database changes can affect the whole app.
6. Keep the README and documentation updated when setup steps change.
7. Test login, listing creation, booking, payment, and dashboard flows before demo day.
8. Communicate blockers early so another team member can help.

## Demo Responsibilities

During the final demo, the team should cover:

1. Project idea and business model.
2. User journey.
3. Database schema and 2NF explanation.
4. Two MVP features.
5. Stored procedures and triggers.
6. Revenue reporting.
7. Deployment and Docker setup.

## MVP Features To Demonstrate

### MVP Feature 1: Owner Listing Flow

An owner signs in, creates a vehicle listing, uploads an image, and sees the listing on the dashboard.

### MVP Feature 2: Renter Booking and Payment Flow

A renter signs in, views available listings, books a vehicle, completes payment, and the system records revenue.

## Group Etiquette

- Be respectful when reviewing code.
- Ask before rewriting another member's large feature.
- Keep project decisions documented.
- Focus on the final rubric before adding optional features.
- Prioritize a working demo over unfinished extra features.
