Barangay 663-A Identification System (Django + React)

Overview
- Backend: Django REST Framework with JWT auth (SimpleJWT), apps for accounts, residents, events, common, and sync.
- Frontend: React (Vite). Admins can manage residents and events, while gate operators and residents use QR/face-assisted flows.

Fresh Clone Setup
1) Clone the repo
   - `git clone https://github.com/yohan-cloud/E-Gate.git`
   - `cd E-Gate`

2) Set up the backend
   - Python 3.11+
   - Create and activate a virtual environment
   - Install dependencies: `pip install -r backend/requirements.txt`
   - Copy `.env.example` to `.env`
   - For local development, set `DJANGO_DEBUG=true` in `.env`
   - Prefer PostgreSQL by setting `DATABASE_URL` or `DB_ENGINE=postgres`
   - Keep `SQLITE_PATH=backend/db.sqlite3` only if you want a local SQLite database

3) Create a new local database
   - Run migrations: `python backend/manage.py migrate`
   - Create an admin account: `python backend/manage.py createsuperuser`
   - Start the backend: `python backend/manage.py runserver 0.0.0.0:8000`
   - Health check: `http://127.0.0.1:8000/api/health/`
   - Swagger docs: `http://127.0.0.1:8000/api/docs/`

4) Set up the frontend
   - `cd frontend`
   - Create `frontend/.env` with `VITE_API_URL=http://127.0.0.1:8000/api`
   - Install dependencies: `npm ci`
   - Start the dev server: `npm run dev -- --host`

5) Open the app
   - Local browser: `http://127.0.0.1:5173`
   - For LAN demos on phones, use `http://<laptop-ip>:5173`

Local Database Notes
- The repository does not include `backend/db.sqlite3`.
- A fresh clone creates its own database when you run `python backend/manage.py migrate`.
- Your local SQLite file will be created at `backend/db.sqlite3` unless you change `SQLITE_PATH` in `.env`.
- Local databases, generated QR images, logs, and dev certificates are intentionally ignored by git.

PostgreSQL Setup
1) Install PostgreSQL and make sure the server is running.
2) Create a database and user, for example:
   - Database: `egate`
   - User: `egate_user`
   - Password: your own strong password
3) In the repo root `.env`, use either of these patterns:
   - `DATABASE_URL=postgresql://egate_user:YOUR_PASSWORD@127.0.0.1:5432/egate`
   - or:
     - `DB_ENGINE=postgres`
     - `DB_NAME=egate`
     - `DB_USER=egate_user`
     - `DB_PASSWORD=YOUR_PASSWORD`
     - `DB_HOST=127.0.0.1`
     - `DB_PORT=5432`
4) Run:
   - `python backend/manage.py migrate`
   - `python backend/manage.py createsuperuser`
5) Start the backend as usual:
   - `python backend/manage.py runserver 0.0.0.0:8000`

SQLite to PostgreSQL Migration
1) Keep your old SQLite settings in a temporary backup copy of `.env`.
2) Export your current data:
   - `python backend/manage.py dumpdata --exclude auth.permission --exclude contenttypes > data.json`
3) Switch `.env` to PostgreSQL.
4) Create the PostgreSQL schema:
   - `python backend/manage.py migrate`
5) Import the data:
   - `python backend/manage.py loaddata data.json`
6) Create a fresh superuser if needed and verify the app in the browser.

Environment Variables
- Copy `.env.example` to `.env` (repo root) and adjust values.
- Key settings:
  - `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`
  - `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`
  - Database: `DATABASE_URL` or `DB_ENGINE=postgres`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
  - SQLite fallback: `SQLITE_PATH=backend/db.sqlite3`
  - JWT: `JWT_ACCESS_MINUTES`, `JWT_REFRESH_DAYS`
  - Face: `FACE_LOCATOR=hog|cnn`, `FACE_TOLERANCE=0.6`
  - Email/password reset settings

Face Recognition (optional)
- For Windows, Miniconda is recommended.
- Minimal conda setup: install `dlib` from conda-forge, then install `numpy`, `opencv`, and `face-recognition`.
- If the face libraries are missing, related endpoints return `501` and the rest of the system still works.

Notes
- For LAN demos with phones, `DJANGO_DEBUG=true` enables permissive CORS/hosts. Tighten allowlists for staging or production.
- Media and logs are ignored in git, including `backend/media`, `backend/backend_logs`, and local SQLite files.

EC2 Notes
- Build the frontend on the server before reloading Nginx:
  - `cd /opt/egate/frontend`
  - `npm ci`
  - `npm run build`
- Use [deploy/ec2/nginx.conf](/c:/Users/Yohan/OneDrive%20-%20adamson.edu.ph/Desktop/E-Gate/deploy/ec2/nginx.conf) as the site template when `/` should serve the React app and `/api/` plus `/admin/` should stay on Django.
- If the Ubuntu welcome page appears at `http://<ec2-ip>/`, disable the default site and enable the app site:
  - `sudo rm -f /etc/nginx/sites-enabled/default`
  - `sudo ln -sf /etc/nginx/sites-available/egate /etc/nginx/sites-enabled/egate`
  - `sudo nginx -t && sudo systemctl reload nginx`

Capstone Hosting Recommendation
- Frontend: AWS Amplify Hosting
- Backend: EC2 or Lightsail with `Nginx + Gunicorn`
- Database: Amazon RDS PostgreSQL
- Media/uploads: Amazon S3
- Sample deployment/runtime files are in `deploy/ec2/` and `deploy/aws/`
