"""Production server for Windows and other non-Docker installs: python serve.py [--migrate].

Docker keeps using gunicorn (docker-compose.prod.yml). gunicorn does not run on Windows; waitress does.
Settings come from the environment, exactly as for manage.py.
"""

import argparse
import logging
import os
import sys

DEFAULT_HOST = '0.0.0.0'
DEFAULT_PORT = 8000
# One process with threads. Sales lock rows in Postgres, so threads are safe; keep it near CPU x 4.
DEFAULT_THREADS = 12
MAX_THREADS = 64


def _settings(argv):
    parser = argparse.ArgumentParser(description='Serve Tijori with waitress.')
    parser.add_argument('--host', default=os.getenv('TIJORI_HOST', DEFAULT_HOST))
    parser.add_argument('--port', type=int, default=int(os.getenv('TIJORI_PORT', DEFAULT_PORT)))
    parser.add_argument('--threads', type=int, default=int(os.getenv('TIJORI_THREADS', DEFAULT_THREADS)))
    parser.add_argument('--migrate', action='store_true', help='Apply database migrations before serving.')
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error('--port must be between 1 and 65535.')
    if not 1 <= args.threads <= MAX_THREADS:
        parser.error(f'--threads must be between 1 and {MAX_THREADS}.')
    return args


def main(argv=None):
    if (sys.argv[1:] if argv is None else argv) == ['--desktop-worker']:
        from smartshop_pos.desktop_runtime import worker

        return worker()
    args = _settings(sys.argv[1:] if argv is None else argv)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartshop_pos.settings')
    import django
    from django.conf import settings
    from django.core.management import call_command

    django.setup()
    log = logging.getLogger('tijori.serve')
    if settings.DEBUG:
        log.warning('DJANGO_DEBUG is on. Turn it off for a shop install.')
    # Fail at start, not on the first sale: database reachable and configuration valid.
    call_command('check', deploy=not settings.DEBUG)
    if args.migrate:
        call_command('migrate', interactive=False)

    from waitress import serve

    from smartshop_pos.wsgi import application

    log.info('Tijori serving on http://%s:%s with %s threads', args.host, args.port, args.threads)
    # channel_timeout bounds idle keep-alive connections; the notification stream sends heartbeats.
    serve(application, host=args.host, port=args.port, threads=args.threads, channel_timeout=120, ident='Tijori')


if __name__ == '__main__':
    main()
