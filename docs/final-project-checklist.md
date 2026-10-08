# CSC33600 Final Project Checklist

This checklist maps GoRent project files to the final project requirements.

## Required Deliverables

| Requirement | Project Evidence |
| --- | --- |
| Team signup and group etiquette | `docs/team-roles.md` |
| Idea and user journey | `presentation/demo-script.md` |
| Early/final database schema | `backend/schema.sql` |
| Fully normalized relational design, minimum 2NF | `docs/database-design-2nf.md` |
| 2NF data modeling diagram | `docs/database-design-2nf.md` text ERD section |
| Live UI and database connection | `README.md`, `backend/README.md`, deployed frontend/backend setup |
| Two MVP functionalities | Owner listing flow and renter booking/payment flow in `presentation/demo-script.md` |
| Revenue reporting | `docs/revenue-reporting.md`, `backend/migrations/views.sql` |
| Stored procedures and triggers | `backend/migrations/stored_procedures_triggers.sql` |
| Deployment | `README.md` deployment section |
| Docker support | `Dockerfile`, `backend/Dockerfile`, `docker-compose.yml`, `.github/workflows/docker.yml` |

## SQL Setup Order

Run these files in Supabase SQL Editor in this order:

```text
1. backend/schema.sql
2. backend/migrations/stored_procedures_triggers.sql
3. backend/migrations/views.sql
```

## Demo Order

1. Explain project idea and revenue model.
2. Show database tables and 2NF design.
3. Demo owner creating a listing.
4. Demo renter booking a car.
5. Show payment/revenue records.
6. Explain stored procedures and triggers.
7. Show Docker and deployment setup.

## Remaining Manual Step

The team should still create actual slide visuals from the demo script if the professor requires a slide deck. The repo now includes the content needed for the final presentation, but not a finished PowerPoint or Google Slides file.
