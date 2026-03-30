Barangay 663-A Identification System Deployment Notes

Target architecture for the capstone
- Frontend: AWS Amplify Hosting
- Backend: EC2 or Lightsail Ubuntu VM running `Nginx + Gunicorn`
- Database: Amazon RDS PostgreSQL
- Media/uploads: Amazon S3

Why this layout
- It is simpler and more predictable than ECS for a student project.
- The React frontend can deploy directly from Git with Amplify.
- The Django backend keeps full control of native Python dependencies on a normal Linux VM.
- RDS removes the biggest data-loss risk compared to SQLite on the server.
- S3 keeps uploads and generated files off the VM so redeploys are safer.

Files added for this deployment
- `amplify.yml`: Amplify build config for the `frontend/` app
- `frontend/.env.production.example`: frontend production API base URL example
- `backend/gunicorn.conf.py`: Gunicorn runtime config
- `deploy/ec2/start_backend.sh`: startup script for migrations, static collection, and Gunicorn
- `deploy/ec2/egate.service`: systemd service example
- `deploy/ec2/nginx.conf`: reverse proxy example

Backend production environment
Use `.env.production.example` as your template and store the real `.env` only on the server.

Frontend production environment
Create the following in Amplify environment variables or a local production env file:

```env
VITE_API_URL=https://api.your-domain.com/api
```

AWS setup order
1. Create an S3 bucket for media uploads.
2. Create an RDS PostgreSQL instance.
3. Launch an Ubuntu Lightsail or EC2 instance for Django.
4. Point a backend domain like `api.your-domain.com` to that VM.
5. Deploy the frontend to Amplify and point `app.your-domain.com` to it.
6. Set the frontend `VITE_API_URL` to your backend API domain.

RDS checklist
1. Create a PostgreSQL database in the same AWS region as the backend VM.
2. Allow inbound access from the EC2/Lightsail instance security group.
3. Copy the connection string into `DATABASE_URL`.
4. Keep `DB_SSLMODE=require`.

S3 checklist
1. Create one bucket for app assets and media.
2. Grant the backend server access through an IAM role if using EC2.
3. If using Lightsail, use an IAM access key with restricted bucket permissions.
4. Set `USE_S3_STORAGE=true` and the bucket variables in `.env`.

Backend VM checklist
1. Install system packages:
   - `python3`
   - `python3-venv`
   - `python3-dev`
   - `build-essential`
   - `libpq-dev`
   - `nginx`
2. Clone this repo to `/opt/egate`.
3. Create a virtual environment and install dependencies:
   - `python3 -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install --upgrade pip`
   - `pip install -r backend/requirements.txt`
4. Copy `.env.production.example` to `/opt/egate/.env` and fill in the real values.
5. Run:
   - `python backend/manage.py migrate`
   - `python backend/manage.py collectstatic --noinput`
6. Install the systemd service:
   - copy `deploy/ec2/egate.service` to `/etc/systemd/system/egate.service`
   - adjust the `User` if needed
   - run `sudo systemctl daemon-reload`
   - run `sudo systemctl enable --now egate`
7. Install the Nginx site:
   - copy `deploy/ec2/nginx.conf` to `/etc/nginx/sites-available/egate`
   - update `server_name`
   - enable the site and reload Nginx

Amplify checklist
1. Connect the Git repository in AWS Amplify.
2. Set the app root to `frontend`.
3. Amplify should detect `amplify.yml` from the repo root.
4. Add `VITE_API_URL=https://api.your-domain.com/api` as an environment variable.
5. Deploy and attach your frontend domain.

Recommended production env highlights
```env
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=api.your-domain.com
CSRF_TRUSTED_ORIGINS=https://app.your-domain.com
CORS_ALLOWED_ORIGINS=https://app.your-domain.com
DATABASE_URL=postgresql://your_user:your_password@your-rds-host:5432/your_db
DB_SSLMODE=require
USE_S3_STORAGE=true
AWS_STORAGE_BUCKET_NAME=your-s3-bucket
AWS_S3_REGION_NAME=ap-southeast-1
USE_X_FORWARDED_HOST=true
USE_X_FORWARDED_PORT=true
TRUST_X_FORWARDED_PROTO=true
SECURE_SSL_REDIRECT=true
ALLOW_PUBLIC_GATE=false
```

Notes
- The backend still supports SQLite for local development, but production should use RDS.
- Static files can be served by WhiteNoise on the backend VM; media/uploads should go to S3.
- If face-recognition dependencies are difficult on the Linux VM, the rest of the system can still run, but those endpoints may be limited.
- Keep `.env`, database dumps, generated QR files, and private cert files out of Git in the long term.
