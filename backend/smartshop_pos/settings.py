import os
import sys
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

# Local manage.py: load repo-root .env (Docker injects env via compose)
_root_env = BASE_DIR.parent / '.env'
if _root_env.exists():
    for _line in _root_env.read_text(encoding='utf-8').splitlines():
        _line = _line.strip()
        if not _line or _line.startswith('#') or '=' not in _line:
            continue
        _key, _val = _line.split('=', 1)
        os.environ.setdefault(_key.strip(), _val.strip())

DEBUG = os.getenv('DJANGO_DEBUG', 'False').lower() in ('1', 'true', 'yes')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', '')
if not SECRET_KEY or SECRET_KEY.startswith('change-me'):
    if not DEBUG:
        raise ImproperlyConfigured('Set a real DJANGO_SECRET_KEY in .env before running with DEBUG off.')
    SECRET_KEY = 'django-insecure-dev-only'

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
    if host.strip()
]

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:3000,http://localhost:5173',
    ).split(',')
    if origin.strip()
]

CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'auth.apps.AuthConfig',
    'inventory.apps.InventoryConfig',
    'suppliers.apps.SuppliersConfig',
    'sales.apps.SalesConfig',
    'audit.apps.AuditConfig',
    'purchases.apps.PurchasesConfig',
    'customers.apps.CustomersConfig',
    'finance.apps.FinanceConfig',
    'notifications.apps.NotificationsConfig',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'smartshop_pos.urls'

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

WSGI_APPLICATION = 'smartshop_pos.wsgi.application'

POSTGRES_HOST = os.getenv('POSTGRES_HOST')

if POSTGRES_HOST:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('POSTGRES_DB', 'smartshop'),
            'USER': os.getenv('POSTGRES_USER', 'smartshop'),
            'PASSWORD': os.getenv('POSTGRES_PASSWORD', ''),
            'HOST': POSTGRES_HOST,
            'PORT': os.getenv('POSTGRES_PORT', '5432'),
            # The dev server opens a thread per request, so held connections would pile up there.
            'CONN_MAX_AGE': 0 if DEBUG else 60,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.getenv('DJANGO_TIME_ZONE', 'Asia/Karachi')
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
TIJORI_FRONTEND_DIR = os.getenv('TIJORI_FRONTEND_DIR', '')
TIJORI_STATIC_DIR = os.getenv('TIJORI_STATIC_DIR', str(BASE_DIR / 'staticfiles'))
STATIC_ROOT = TIJORI_STATIC_DIR

AUTH_USER_MODEL = 'custom_auth.CustomUser'

BACKUP_DIR = os.getenv('BACKUP_DIR', str(BASE_DIR / 'backups'))

# Product search (bulk catalogue). Empty disables indexing/search endpoints fail closed.
# Django tests must not write into the live shop index (same ES hosts many DBs by product id).
ELASTICSEARCH_URL = os.getenv('ELASTICSEARCH_URL', '').rstrip('/')
ELASTICSEARCH_INDEX = os.getenv('ELASTICSEARCH_INDEX', 'tijori_products')
if len(sys.argv) > 1 and sys.argv[1] == 'test':
    ELASTICSEARCH_URL = ''


REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'login': '10/minute',
        'backup': '5/hour',
    },
}

# A shift's working day; the cashier stays logged in across it.
SESSION_COOKIE_AGE = 60 * 60 * 14

# Off by default: a shop LAN usually runs over plain HTTP, and secure cookies would break login there.
if os.getenv('DJANGO_HTTPS', 'False').lower() in ('1', 'true', 'yes'):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'plain': {'format': '{asctime} {levelname} {name} {message}', 'style': '{'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
