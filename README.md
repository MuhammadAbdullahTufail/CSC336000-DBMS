# GoRent

GoRent is a peer-to-peer car rental app built with:

- Next.js frontend
- Flask backend API
- Supabase Postgres database
- Supabase Storage for vehicle images

The frontend lives at the repo root. The backend lives in `backend/`.

## Deployed App

The link to the deployed app: https://go-rent-delta.vercel.app/

## Prerequisites

Install these before running the project:

- Node.js 22 or newer
- Python 3.14 or compatible Python 3.x
- Docker Desktop, only if using Docker
- A Supabase project

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the full SQL in `backend/schema.sql`.
4. Open Storage.
5. Create a public bucket named `vehicle-images`.
6. Copy your Supabase project URL and service role key.
7. Copy your Supabase Postgres pooler URI from Project Settings -> Database.

Use the pooler URI for `SUPABASE_DB_URL`, especially with Docker. Avoid the direct `db.<project-ref>.supabase.co:5432` URL because Docker Desktop on Windows may not reach Supabase's IPv6 direct database endpoint.

## Environment Files

Create the frontend env file at the repo root for normal local development:

```powershell
Copy-Item .env.example .env.local
```

For normal local development, keep:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000
```

Optional: create a root `.env` only if you want Docker Compose to read port or API URL overrides automatically:

```powershell
Copy-Item .env.example .env
```

Common Docker override values:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
FRONTEND_PORT=3001
BACKEND_PORT=5000
```

Create the backend env file:

```powershell
Copy-Item backend/.env.example backend/.env
```

Fill in `backend/.env`:

```env
SECRET_KEY=make-a-long-random-secret
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
SUPABASE_SSLMODE=require
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=vehicle-images
```

Do not commit `.env`, `.env.local`, or `backend/.env`.

## Run Without Docker

Use this path for day-to-day development.

### 1. Install Frontend Dependencies

From the repo root:

```powershell
npm install
```

### 2. Install Backend Dependencies

From the repo root:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
```

### 3. Start The Backend

From the repo root:

```powershell
cd backend
.\venv\Scripts\python.exe app.py
```

The backend runs at:

```text
http://127.0.0.1:5000
```

Check it:

```powershell
curl.exe http://127.0.0.1:5000/api/health
```

Expected healthy response:

```json
{"database":"connected","status":"healthy"}
```

### 4. Start The Frontend

Open a second terminal at the repo root:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

## Run With Docker

Use this path when you want a cleaner one-command run that does not require local Python or Node setup beyond Docker.

Docker runs:

- `frontend`: Next.js app on port `3000`
- `backend`: Flask API on port `5000`

Supabase still runs in the cloud. Docker does not create a local database.

### 1. Confirm Env Files

Make sure `backend/.env` exists and uses the Supabase pooler URI:

```env
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

For Docker, the frontend defaults to:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

You do not need a root `.env` for Docker unless you want to override `NEXT_PUBLIC_API_URL`, `FRONTEND_PORT`, or `BACKEND_PORT`.

### 2. Build And Start

From the repo root:

```powershell
docker compose up --build
```

Open:

```text
http://localhost:3000
```

Check the backend:

```powershell
curl.exe http://localhost:5000/api/health
```

### 3. If Port 3000 Is Busy

Use another frontend port:

```powershell
$env:FRONTEND_PORT='3001'
docker compose up --build
```

Open:

```text
http://localhost:3001
```

### 4. Stop Docker

```powershell
docker compose down
```

## Useful Commands

Run frontend lint:

```powershell
npm run lint
```

Build the frontend:

```powershell
npm run build
```

Compile-check the backend:

```powershell
python -m py_compile backend/app.py
```

Build Docker images only:

```powershell
docker compose build
```

## Common Issues

### Backend health says database disconnected

Check `backend/.env`.

Most likely causes:

- `SUPABASE_DB_URL` is missing or wrong
- you used the direct Supabase database URL instead of the pooler URI
- the Supabase password is wrong
- the schema has not been run yet

### Frontend cannot reach backend

Check `NEXT_PUBLIC_API_URL`.

For local non-Docker development:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000
```

For Docker:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

If this value changes, rebuild/restart the frontend.

### Image upload says bucket not found

In Supabase Storage, create a public bucket matching:

```env
SUPABASE_STORAGE_BUCKET=vehicle-images
```

If you use a different bucket name, update `backend/.env`.

## Deployment

The quickest deployment setup is:

- Frontend on Vercel
- Backend on Render
- Database and image storage on Supabase

Backend Render settings:

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: gunicorn --bind 0.0.0.0:$PORT app:app
```

Frontend Vercel settings:

```text
Root Directory: .
Framework: Next.js
Build Command: npm run build
```

Set Vercel's `NEXT_PUBLIC_API_URL` to the Render backend URL.

For backend API details, see `backend/README.md`.
