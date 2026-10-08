# Share GoRent With Docker Images

This folder contains the files someone needs to run GoRent from prebuilt Docker images instead of building from source.

Use Docker Hub for the simplest sharing flow.

If you are the person receiving shared Docker images and only want to run them, read `RUN_SHARED_IMAGE.md`.

## What Gets Shared

You will publish two images:

- `yourdockerusername/gorent-frontend:latest`
- `yourdockerusername/gorent-backend:latest`

Other people will run them with:

- `docker-compose.prod.yml`
- `.env`
- `backend.env`

Supabase still runs in the cloud. The Docker images do not include a database.

## Part 1: Publish The Images

Run these steps on your computer from the repo root.

### 1. Log In To Docker Hub

```powershell
docker login
```

### 2. Build The Local Images

```powershell
docker compose build
```

This creates local images similar to:

```text
sp26-csc33600-repo-7777-frontend:latest
sp26-csc33600-repo-7777-backend:latest
```

### 3. Tag The Images

Replace `yourdockerusername` with your Docker Hub username:

```powershell
docker tag sp26-csc33600-repo-7777-frontend:latest yourdockerusername/gorent-frontend:latest
docker tag sp26-csc33600-repo-7777-backend:latest yourdockerusername/gorent-backend:latest
```

### 4. Push The Images

```powershell
docker push yourdockerusername/gorent-frontend:latest
docker push yourdockerusername/gorent-backend:latest
```

After this, other people can pull and run the app without building it locally.

## Part 2: Give Someone The Run Files

Send them this `docker-share` folder, or tell them to copy these files:

```text
docker-compose.prod.yml
.env.example
backend.env.example
README.md
```

They do not need the full repo if they only want to run the published images.

## Part 3: Have Someone Run The App

On their computer, they should install Docker Desktop first.

### 1. Create `.env`

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

```env
DOCKERHUB_USERNAME=yourdockerusername
IMAGE_TAG=latest
FRONTEND_PORT=3000
BACKEND_PORT=5000
```

### 2. Create `backend.env`

Copy `backend.env.example` to `backend.env`:

```powershell
Copy-Item backend.env.example backend.env
```

Edit `backend.env` with the Supabase values:

```env
SECRET_KEY=make-a-long-random-secret
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
SUPABASE_SSLMODE=require
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=vehicle-images
```

Use the Supabase pooler URI for `SUPABASE_DB_URL`.

### 3. Start The App

```powershell
docker compose -f docker-compose.prod.yml up
```

Open:

```text
http://localhost:3000
```

Check the backend:

```text
http://localhost:5000/api/health
```

### 4. If Port 3000 Is Busy

Edit `.env`:

```env
FRONTEND_PORT=3001
```

Then run again:

```powershell
docker compose -f docker-compose.prod.yml up
```

Open:

```text
http://localhost:3001
```

### 5. Stop The App

```powershell
docker compose -f docker-compose.prod.yml down
```

## Important Frontend URL Note

The frontend image is built with:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

That is correct when someone runs both frontend and backend on the same computer with backend exposed on port `5000`.

If you want to host the backend somewhere else, rebuild and repush the frontend image with the public backend URL:

```powershell
docker compose build frontend --build-arg NEXT_PUBLIC_API_URL=https://your-backend-url.com
docker tag sp26-csc33600-repo-7777-frontend:latest yourdockerusername/gorent-frontend:latest
docker push yourdockerusername/gorent-frontend:latest
```

## Keep Secrets Private

Do not publish or commit:

- `backend.env`
- real Supabase service role keys
- real database passwords
- real `SECRET_KEY`

Only share the `.example` files publicly.
