# Run The Shared GoRent Docker Images

Use this guide if someone shared the GoRent Docker images with you and you only want to run the app.

You do not need the full source code for this path. You only need:

- Docker Desktop
- `docker-compose.prod.yml`
- `.env`
- `backend.env`

## 1. Install Docker Desktop

Install Docker Desktop from:

```text
https://www.docker.com/products/docker-desktop/
```

Start Docker Desktop before running the commands below.

## 2. Create A Folder For The App

Create any folder on your computer, for example:

```powershell
mkdir gorent-docker
cd gorent-docker
```

Put `docker-compose.prod.yml` in this folder.

## 3. Create `.env`

Create a file named `.env` in the same folder as `docker-compose.prod.yml`.

Paste this into `.env`:

```env
DOCKERHUB_USERNAME=yourdockerusername
IMAGE_TAG=latest
FRONTEND_PORT=3000
BACKEND_PORT=5000
```

Replace `yourdockerusername` with the Docker Hub username of the person sharing the images.

Example:

```env
DOCKERHUB_USERNAME=callo
IMAGE_TAG=latest
FRONTEND_PORT=3000
BACKEND_PORT=5000
```

## 4. Create `backend.env`

Create a file named `backend.env` in the same folder.

Paste this into `backend.env`:

```env
SECRET_KEY=make-a-long-random-secret
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
SUPABASE_SSLMODE=require
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=vehicle-images
```

The person sharing the app should give you the correct Supabase values, or you can use your own Supabase project.

Important:

- Use the Supabase pooler URI for `SUPABASE_DB_URL`.
- Do not use the direct `db.<project-ref>.supabase.co:5432` URL if you are on Docker Desktop.
- Keep `backend.env` private because it contains secrets.

## 5. Pull And Start The App

Run this from the folder containing `docker-compose.prod.yml`:

```powershell
docker compose -f docker-compose.prod.yml up
```

Docker will pull the images automatically if you do not already have them.

Open the app:

```text
http://localhost:3000
```

Check the backend:

```text
http://localhost:5000/api/health
```

A healthy backend returns:

```json
{"database":"connected","status":"healthy"}
```

## 6. If Port 3000 Is Busy

Edit `.env`:

```env
FRONTEND_PORT=3001
```

Start again:

```powershell
docker compose -f docker-compose.prod.yml up
```

Open:

```text
http://localhost:3001
```

## 7. Stop The App

Press `Ctrl+C` in the terminal.

Or, from the same folder, run:

```powershell
docker compose -f docker-compose.prod.yml down
```

## 8. Update To A Newer Shared Image

If the person sharing the app pushes a newer image with the same tag:

```powershell
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up
```

If they give you a different tag, edit `.env`:

```env
IMAGE_TAG=v2
```

Then run:

```powershell
docker compose -f docker-compose.prod.yml up
```

## Troubleshooting

### `pull access denied`

The Docker Hub images are private or the username/image name is wrong.

Ask the person sharing the app to either:

- make the Docker Hub repositories public, or
- invite your Docker Hub account, then run `docker login`.

### Backend says `database disconnected`

Check `backend.env`.

Most likely causes:

- `SUPABASE_DB_URL` is wrong
- direct Supabase database URL was used instead of pooler URI
- Supabase password is wrong
- Supabase schema was not created

### Frontend loads but listings do not

Check:

```text
http://localhost:5000/api/health
```

If the backend is unhealthy, fix `backend.env` first.

### Image upload fails

Check:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- bucket exists in Supabase Storage
- bucket name matches `backend.env`
