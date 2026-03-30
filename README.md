Barangay 663-A Identification System (Django + React)

Overview
- Backend: Django REST Framework with JWT auth (SimpleJWT), apps for accounts, residents, events.
- Frontend: React (Vite). Admins can manage events and mark attendance via QR/face; residents can sign up, browse and register.

Quick Start (local LAN demo)
1) Backend
   - Python 3.11+
   - Create env and install deps: `pip install -r backend/requirements.txt`
   - Copy `.env.example` to `.env`; set `DJANGO_DEBUG=true` for LAN demo.
   - Migrate DB: `python backend/manage.py migrate`
   - Run dev server (reachable by phones): `python backend/manage.py runserver 0.0.0.0:8000`
   - Health: http://127.0.0.1:8000/api/health/

2) Frontend
   - `cd frontend`
   - Set `frontend/.env` with `VITE_API_URL=http://<laptop-ip>:8000/api` (use the LAN IP phones can reach)
   - Install and run: `npm ci && npm run dev -- --host`
   - Open on phone: `http://<laptop-ip>:5173`

3) Admin login (seed data)
   - Use the Django admin shell or create an admin via the API once registered; current DB snapshots may already contain demo users.

Environment Variables
- Copy `.env.example` to `.env` (backend root) and adjust values.
- Key settings:
  - `DJANGO_SECRET_KEY`, `DJANGO_DEBUG` (false for prod), `DJANGO_ALLOWED_HOSTS`
  - `CORS_ALLOWED_ORIGINS` (e.g., `http://127.0.0.1:5173`)
  - Database: `DB_ENGINE=postgres`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
  - JWT: `JWT_ACCESS_MINUTES`, `JWT_REFRESH_DAYS`
  - Face: `FACE_LOCATOR=hog|cnn`, `FACE_TOLERANCE=0.6`
  - Password reset: codes are hashed at rest; wire `request_password_reset_code` to your SMS/Email provider to deliver OTPs.

Face Recognition (optional)
- For Windows, using Miniconda is recommended.
- Minimal conda steps: create env with Python 3.11, install `dlib` (conda-forge), `numpy`, `opencv`, then `pip install face-recognition`.
- If face libs are not present, related endpoints return 501 and the rest of the system works.

Notes
- Swagger docs: http://127.0.0.1:8000/api/docs/
- Media and logs are ignored in git (`backend/media`, `backend/backend_logs`).
 - For LAN demos with phones, `DJANGO_DEBUG=true` enables permissive CORS/hosts; switch to strict allowlists for staging/prod.

Capstone Hosting Recommendation
- Frontend: AWS Amplify Hosting
- Backend: EC2 or Lightsail with `Nginx + Gunicorn`
- Database: Amazon RDS PostgreSQL
- Media/uploads: Amazon S3
- Deployment steps and sample runtime files are in `DEPLOYMENT.md` and `deploy/ec2/`
