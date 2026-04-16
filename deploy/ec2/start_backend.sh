#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/egate}"
VENV_DIR="${VENV_DIR:-$ROOT_DIR/.venv}"

cd "$ROOT_DIR"
source "$VENV_DIR/bin/activate"

python backend/manage.py migrate --noinput
python backend/manage.py collectstatic --noinput

exec gunicorn egate_backend.wsgi:application \
  --chdir backend \
  --config "$ROOT_DIR/backend/gunicorn.conf.py"
