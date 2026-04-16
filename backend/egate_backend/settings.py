from pathlib import Path
from urllib.parse import parse_qsl, urlparse
import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load simple .env file from project root (one key=value per line) if present
ENV_FILE = BASE_DIR.parent / ".env"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip())


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
DEBUG = os.getenv('DJANGO_DEBUG', 'false').lower() == 'true'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY') or ('dev-insecure-key' if DEBUG else None)
if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")

ALLOW_PUBLIC_GATE = os.getenv('ALLOW_PUBLIC_GATE', 'true' if DEBUG else 'false').lower() == 'true'


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {'1', 'true', 'yes', 'on'}

# SECURITY WARNING: don't run with debug turned on in production!
if DEBUG:
    ALLOWED_HOSTS = ["*"]
else:
    raw_hosts = os.getenv('DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost')
    ALLOWED_HOSTS = [h.strip() for h in raw_hosts.split(',') if h.strip()]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'drf_yasg',
    # Local apps
    'accounts',
    'common',
    'residents',
    'events',
    'sync',
]

# Enable CORS headers if package is available
try:
    import corsheaders  # type: ignore
    INSTALLED_APPS.append('corsheaders')
except Exception:
    corsheaders = None

try:
    import storages  # type: ignore
    INSTALLED_APPS.append('storages')
except Exception:
    storages = None

try:
    import whitenoise  # type: ignore
except Exception:
    whitenoise = None

# Order middleware explicitly and avoid duplicates.
MIDDLEWARE = [
    'django.middleware.gzip.GZipMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
]
if whitenoise:
    MIDDLEWARE.append('whitenoise.middleware.WhiteNoiseMiddleware')
if corsheaders:
    MIDDLEWARE.append('corsheaders.middleware.CorsMiddleware')

MIDDLEWARE += [
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# CORS configuration
# For fast local demos (phones on the same Wi‑Fi), allow any origin when DEBUG is true;
# otherwise default to a comma-separated allowlist from env.
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
    CORS_ALLOWED_ORIGINS = []
else:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()]

CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()]

# Optional regex origins (e.g., allow any 192.168.x.x host in staging)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https?://localhost(:\d+)?$",
    r"^https?://127\.0\.0\.1(:\d+)?$",
    r"^https?://192\.168\.[0-9.]+(:\d+)?$",
]

CORS_ALLOW_CREDENTIALS = True

ROOT_URLCONF = 'egate_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'egate_backend.wsgi.application'


# Database
# Use PostgreSQL in production via env vars; fallback to SQLite for dev
# Env vars: DB_ENGINE (postgres), DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
database_url = os.getenv('DATABASE_URL', '').strip()
db_engine = os.getenv('DB_ENGINE', '').lower()


def _database_from_url(url: str):
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme not in ('postgres', 'postgresql', 'psql'):
        raise ValueError(f"Unsupported DATABASE_URL scheme: {scheme}")
    options = dict(parse_qsl(parsed.query))
    connect_timeout = int(options.pop('connect_timeout', os.getenv('DB_CONNECT_TIMEOUT', '5')))
    sslmode = options.pop('sslmode', os.getenv('DB_SSLMODE', '')).strip()
    db_config = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': parsed.path.lstrip('/'),
        'USER': parsed.username or '',
        'PASSWORD': parsed.password or '',
        'HOST': parsed.hostname or 'localhost',
        'PORT': str(parsed.port or '5432'),
        'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
        'OPTIONS': {
            'connect_timeout': connect_timeout,
        },
    }
    if sslmode:
        db_config['OPTIONS']['sslmode'] = sslmode
    if options:
        db_config['OPTIONS'].update(options)
    return {'default': db_config}


if database_url:
    DATABASES = _database_from_url(database_url)
elif db_engine in ('postgres', 'postgresql', 'psql'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', ''),
            'USER': os.getenv('DB_USER', ''),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
            'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
            'OPTIONS': {
                'connect_timeout': int(os.getenv('DB_CONNECT_TIMEOUT', '5')),
            },
        }
    }
    db_sslmode = os.getenv('DB_SSLMODE', '').strip()
    if db_sslmode:
        DATABASES['default']['OPTIONS']['sslmode'] = db_sslmode
else:
    sqlite_path = os.getenv('SQLITE_PATH')
    if sqlite_path:
        candidate = Path(sqlite_path)
        # Anchor relative paths to repo root to avoid starting the server from the wrong cwd
        sqlite_name = (BASE_DIR.parent / candidate).resolve() if not candidate.is_absolute() else candidate
    else:
        sqlite_name = BASE_DIR / 'db.sqlite3'
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': sqlite_name,
            'OPTIONS': {
                # Avoid filesystem locking issues in restricted environments
                'timeout': 20,
            },
        }
    }


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
os.makedirs(STATIC_ROOT, exist_ok=True)

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'residents.User'

from datetime import timedelta

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.AnonRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'user': os.getenv('DRF_USER_THROTTLE_RATE', '120/min'),
        'anon': os.getenv('DRF_ANON_THROTTLE_RATE', '60/min'),
    }
}

# In development, relax throttling to avoid 429s during fast iteration
if DEBUG:
    REST_FRAMEWORK.update({
        'DEFAULT_THROTTLE_CLASSES': [],
        'DEFAULT_THROTTLE_RATES': {
            'user': os.getenv('DRF_DEBUG_USER_THROTTLE_RATE', '10000/min'),
            'anon': os.getenv('DRF_DEBUG_ANON_THROTTLE_RATE', '10000/min'),
        }
    })

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('JWT_ACCESS_MINUTES', '60'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.getenv('JWT_REFRESH_DAYS', '7'))),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
}

# Ensure log directory exists for file logging
LOG_DIR = BASE_DIR / 'backend_logs'
os.makedirs(LOG_DIR, exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': str(LOG_DIR / 'audit.log'),
            'formatter': 'verbose',
        },
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING',
        },
        'accounts': {  # logs from accounts app
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
        'events': {  # logs from events app
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Media (for profile photos / QR images)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
ARCHIVE_ROOT = BASE_DIR / 'archive_exports'

# Reverse proxy / HTTPS deployment settings
USE_X_FORWARDED_HOST = env_bool('USE_X_FORWARDED_HOST', False)
USE_X_FORWARDED_PORT = env_bool('USE_X_FORWARDED_PORT', False)
if env_bool('TRUST_X_FORWARDED_PROTO', False):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

SECURE_SSL_REDIRECT = env_bool('SECURE_SSL_REDIRECT', False)
SESSION_COOKIE_SECURE = env_bool('SESSION_COOKIE_SECURE', not DEBUG)
CSRF_COOKIE_SECURE = env_bool('CSRF_COOKIE_SECURE', not DEBUG)
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '0'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool('SECURE_HSTS_INCLUDE_SUBDOMAINS', False)
SECURE_HSTS_PRELOAD = env_bool('SECURE_HSTS_PRELOAD', False)
SECURE_CONTENT_TYPE_NOSNIFF = env_bool('SECURE_CONTENT_TYPE_NOSNIFF', True)
SECURE_REFERRER_POLICY = os.getenv('SECURE_REFERRER_POLICY', 'same-origin')
X_FRAME_OPTIONS = os.getenv('X_FRAME_OPTIONS', 'DENY')

# AWS S3 storage (optional)
AWS_STORAGE_BUCKET_NAME = os.getenv('AWS_STORAGE_BUCKET_NAME', '').strip()
AWS_S3_REGION_NAME = os.getenv('AWS_S3_REGION_NAME', '').strip() or None
AWS_S3_CUSTOM_DOMAIN = os.getenv('AWS_S3_CUSTOM_DOMAIN', '').strip() or None
AWS_QUERYSTRING_AUTH = env_bool('AWS_QUERYSTRING_AUTH', False)
AWS_DEFAULT_ACL = None
AWS_S3_FILE_OVERWRITE = False
AWS_S3_OBJECT_PARAMETERS = {'CacheControl': os.getenv('AWS_S3_CACHE_CONTROL', 'max-age=86400')}
use_s3_storage = env_bool('USE_S3_STORAGE', False) and bool(AWS_STORAGE_BUCKET_NAME) and bool(storages)

if use_s3_storage:
    if AWS_S3_CUSTOM_DOMAIN:
        s3_base_url = f"https://{AWS_S3_CUSTOM_DOMAIN}"
    elif AWS_S3_REGION_NAME:
        s3_base_url = f"https://{AWS_STORAGE_BUCKET_NAME}.s3.{AWS_S3_REGION_NAME}.amazonaws.com"
    else:
        s3_base_url = f"https://{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com"
    STATIC_URL = f"{s3_base_url}/static/"
    MEDIA_URL = f"{s3_base_url}/media/"
    STORAGES = {
        'default': {
            'BACKEND': 'egate_backend.storage_backends.MediaStorage',
        },
        'staticfiles': {
            'BACKEND': 'egate_backend.storage_backends.StaticStorage',
        },
    }
elif whitenoise:
    STORAGES = {
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
        },
    }

# Treat naive datetime inputs from the UI as being in this local timezone.
# This helps when forms use HTML datetime-local (no timezone info).
# Example for Philippines: 'Asia/Manila'. Defaults to None -> current timezone.
INPUT_LOCAL_TIMEZONE = os.getenv('INPUT_LOCAL_TIMEZONE', 'Asia/Manila')

# Caching: prefer Redis/Memcached via env; fallback to in-memory LocMemCache
# Env: CACHE_BACKEND=redis|memcached, REDIS_URL=redis://..., MEMCACHED_LOCATION=127.0.0.1:11211
cache_backend = os.getenv('CACHE_BACKEND', '').lower()
if cache_backend == 'redis' and os.getenv('REDIS_URL'):
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': os.getenv('REDIS_URL'),
            'TIMEOUT': 60,
        }
    }
elif cache_backend == 'memcached' and os.getenv('MEMCACHED_LOCATION'):
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.memcached.MemcachedCache',
            'LOCATION': os.getenv('MEMCACHED_LOCATION'),
            'TIMEOUT': 60,
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'egate-locmem',
            'TIMEOUT': 60,
        }
    }

# Email
# In local development, default to the console backend and only use live SMTP
# when it is explicitly opted into. This prevents broken dev SMTP credentials
# from breaking password reset flows during demos and local testing.
EMAIL_BACKEND = os.getenv(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.smtp.EmailBackend',
).strip()
if DEBUG and EMAIL_BACKEND == 'django.core.mail.backends.smtp.EmailBackend' and not env_bool('EMAIL_ALLOW_SMTP_IN_DEBUG', False):
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '25'))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = env_bool('EMAIL_USE_TLS', False)
EMAIL_USE_SSL = env_bool('EMAIL_USE_SSL', False)
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER or 'no-reply@egate.local')
SERVER_EMAIL = os.getenv('SERVER_EMAIL', DEFAULT_FROM_EMAIL)
EMAIL_TIMEOUT = int(os.getenv('EMAIL_TIMEOUT', '10'))

# For SQLite, force in-memory journaling to sidestep OS-level disk I/O restrictions in dev sandboxes
from django.db.backends.signals import connection_created
def set_sqlite_pragmas(sender, connection, **kwargs):
    if connection.vendor == 'sqlite':
        cursor = connection.cursor()
        cursor.execute('PRAGMA journal_mode=MEMORY;')
        cursor.execute('PRAGMA synchronous=OFF;')

connection_created.connect(set_sqlite_pragmas)
