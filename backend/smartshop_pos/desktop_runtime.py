"""Local Windows service worker. All mutable paths and credentials come from the installer."""

import io
import json
import logging
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

LOG = logging.getLogger('tijori.desktop')


def available_port(preferred, host):
    for port in (preferred, 0):
        with socket.socket() as sock:
            try:
                sock.bind((host, port))
            except OSError:
                if port:
                    continue
                raise
            return sock.getsockname()[1]
    raise RuntimeError('No available port.')


class ShopRuntime:
    def __init__(self):
        self.resources = Path(os.environ['TIJORI_RESOURCES'])
        self.data = Path(os.environ['TIJORI_DATA_DIR'])
        self.bin = self.resources / 'postgres' / 'bin'
        self.cluster = self.data / 'pgdata'
        self.state_path = self.data / 'state' / 'machine.json'
        self.state = json.loads(self.state_path.read_text('utf-8')) if self.state_path.exists() else {}
        self.server = None
        self.owns_pg = False
        self.django_ready = False
        self.version = os.environ['APP_VERSION']
        self.lock = threading.Lock()
        os.environ.update(
            POSTGRES_HOST='127.0.0.1', POSTGRES_DB='tijori', POSTGRES_USER='tijori', DJANGO_DEBUG='False',
            DJANGO_TIME_ZONE='Asia/Karachi', BACKUP_DIR=str(self.data / 'backups'), ELASTICSEARCH_URL='',
            TIJORI_FRONTEND_DIR=str(self.resources / 'frontend'),
            TIJORI_STATIC_DIR=str(self.resources / 'server' / 'staticfiles'),
            PATH=str(self.bin) + os.pathsep + os.environ['PATH'],
        )

    def save(self, **fields):
        next_state = {**self.state, **fields}
        temp = self.state_path.with_suffix('.tmp')
        with temp.open('w', encoding='utf-8') as handle:
            json.dump(next_state, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, self.state_path)
        self.state = next_state

    def pg(self, tool, *args, check=True):
        # A detached postgres can inherit pipe handles. A regular file lets pg_ctl return
        # as soon as it has reported readiness, even while the database continues running.
        with (self.data / 'logs' / 'postgres-tools.log').open('ab') as output:
            result = subprocess.run(
                [str(self.bin / (tool + '.exe')), *map(str, args)], stdin=subprocess.DEVNULL,
                stdout=output, stderr=output, timeout=120, creationflags=subprocess.CREATE_NO_WINDOW,
            )
        if check and result.returncode:
            raise RuntimeError(f'{tool} failed. See the Tijori service log.')
        return result.returncode

    def initialize(self):
        if not self.state.get('managed'):
            if self.cluster.exists():
                raise RuntimeError('Existing database directory has no Tijori ownership record.')
            self.save(managed=True, pgPort=available_port(55432, '127.0.0.1'))
        if not self.cluster.exists():
            if self.state.get('initialized'):
                raise RuntimeError('The managed database is missing. Restore it before opening the till.')
            # Only the service can write this staging directory. A failed initdb is never published.
            from tempfile import TemporaryDirectory

            with TemporaryDirectory(dir=self.data / 'state') as temp:
                temp = Path(temp)
                pwfile = temp / 'password'
                pwfile.write_bytes(os.environ['TIJORI_PG_BOOTSTRAP'].encode('ascii') + b'\n')
                self.pg('initdb', '-D', temp / 'cluster', '-U', 'tijori_admin', '--auth=scram-sha-256',
                        '--encoding=UTF8', '--locale=C', f'--pwfile={pwfile}')
                (temp / 'cluster').rename(self.cluster)
        if not (self.cluster / 'PG_VERSION').is_file():
            raise RuntimeError('The managed database directory is incomplete.')
        self.ensure_database()
        if not self.state.get('initialized'):
            self.save(initialized=True)
        return True

    def ensure_database(self):
        import psycopg2

        if not self.state.get('managed') or not self.cluster.is_dir():
            raise RuntimeError('The shop database has not been initialized.')
        port = self.state['pgPort']
        os.environ['POSTGRES_PORT'] = str(port)
        if self.pg('pg_ctl', 'status', '-D', self.cluster, check=False) != 0:
            self.pg('pg_ctl', 'start', '-w', '-t', '60', '-D', self.cluster,
                    '-l', self.data / 'logs' / 'postgres.log', '-o', f'-h 127.0.0.1 -p {port}')
        self.owns_pg = True
        # Authenticate and check the physical cluster before issuing any DDL.
        conn = psycopg2.connect(dbname='postgres', user='tijori_admin', password=os.environ['TIJORI_PG_BOOTSTRAP'],
                                host='127.0.0.1', port=port, connect_timeout=5)
        try:
            conn.autocommit = True
            with conn.cursor() as cursor:
                cursor.execute('SHOW data_directory')
                if Path(cursor.fetchone()[0]).resolve() != self.cluster.resolve():
                    raise RuntimeError('The database port belongs to a different cluster.')
                if not self.state.get('initialized'):
                    cursor.execute("SELECT 1 FROM pg_roles WHERE rolname='tijori'")
                    if not cursor.fetchone():
                        cursor.execute('CREATE ROLE tijori LOGIN PASSWORD %s', (os.environ['POSTGRES_PASSWORD'],))
                    cursor.execute("SELECT 1 FROM pg_database WHERE datname='tijori'")
                    if not cursor.fetchone():
                        cursor.execute('CREATE DATABASE tijori OWNER tijori')
        finally:
            conn.close()

    def django(self):
        if not self.django_ready:
            import django

            os.environ['DJANGO_SETTINGS_MODULE'] = 'smartshop_pos.settings'
            django.setup()
            self.django_ready = True

    def command(self, name, **options):
        from django.core.management import call_command

        self.django()
        output = io.StringIO()
        call_command(name, stdout=output, stderr=output, **options)
        return output.getvalue()

    def migrate(self, consent):
        if consent is not True or not self.state.get('initialized') or self.state.get('shop'):
            raise RuntimeError('First-run migration requires confirmation for a new managed shop.')
        self.ensure_database()
        self.command('migrate', interactive=False, verbosity=0)
        self.save(consent=True, schemaVersion=self.version)
        return True

    def status(self):
        if not self.state.get('consent'):
            raise RuntimeError('Confirm database setup before creating the shop.')
        return json.loads(self.command('setup_shop', status=True))

    def setup(self, fields, password):
        if self.state.get('shop') or not self.state.get('consent'):
            raise RuntimeError('This installation cannot create another owner.')
        if not isinstance(password, str) or not 1 <= len(password) <= 1024:
            raise ValueError('Invalid password length.')
        options = {
            'store': fields['storeName'], 'branch': fields['branchName'], 'phone': fields.get('phone', ''),
            'address': fields.get('address', ''), 'ntn': fields.get('ntn', ''),
            'footer': fields.get('receiptFooter', ''), 'owner_name': fields['ownerName'],
            'owner_email': fields['ownerEmail'], 'counters': fields['counters'],
        }
        # Journal non-secret inputs before the DB transaction. Never repeat setup with --force.
        self.save(intent={'storeName': options['store'], 'branchName': options['branch'],
                          'email': options['owner_email'], 'counters': options['counters']})
        os.environ['TIJORI_OWNER_PASSWORD'] = password
        try:
            result = json.loads(self.command('setup_shop', **options))
        finally:
            os.environ.pop('TIJORI_OWNER_PASSWORD', None)
        self.finish_setup()
        return result

    def finish_setup(self):
        intent = self.state.get('intent')
        if not intent or self.state.get('shop'):
            return
        result = self.status()
        if result['configured'] and result['owner_email'].casefold() == intent['email'].strip().casefold():
            if result['store'] != intent['storeName'].strip() or result['counters'] != intent['counters']:
                raise RuntimeError('Committed store details differ from the pending setup.')
            self.save(shop={'storeName': result['store'], 'branchName': intent['branchName']}, intent=None)

    def public_config(self):
        return {'port': self.state.get('port', 8000), 'dataDir': str(self.data), 'appVersion': self.version}

    def start(self):
        if not self.state.get('shop'):
            raise RuntimeError('Complete store setup before starting the till.')
        self.ensure_database()
        if self.state.get('schemaVersion') != self.version:
            if not self.state.get('consent'):
                raise RuntimeError('This database has no recorded setup consent.')
            self.command('migrate', interactive=False, verbosity=0)
            self.save(schemaVersion=self.version)
        if self.server and self.server.poll() is None:
            return self.public_config()
        ips = sorted({row[4][0] for row in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
        port = available_port(self.state.get('port', 8000), '0.0.0.0')
        nonce = secrets.token_hex(24)
        env = {**os.environ, 'DJANGO_ALLOWED_HOSTS': ','.join(['localhost', '127.0.0.1', *ips]),
               'TIJORI_BOOT_ID': nonce}
        env.pop('TIJORI_PG_BOOTSTRAP', None)
        with (self.data / 'logs' / 'server.log').open('ab') as log:
            self.server = subprocess.Popen(
                [str(self.resources / 'server' / 'tijori-server.exe'), '--port', str(port)],
                env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW,
            )
        try:
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline and self.server.poll() is None:
                try:
                    with urlopen(f'http://127.0.0.1:{port}/api/health-check/', timeout=2) as response:
                        if response.headers.get('X-Tijori-Boot') == nonce and json.load(response)['status'] == 'ok':
                            self.save(port=port)
                            return self.public_config()
                except (OSError, URLError, ValueError):
                    pass
                time.sleep(0.3)
            raise RuntimeError('The shop server did not become ready. See the Tijori server log.')
        except Exception:
            self.stop_server()
            raise

    def stop_server(self):
        if self.server and self.server.poll() is None:
            self.server.terminate()
            self.server.wait(timeout=20)
        self.server = None

    def stop(self):
        from django.db import connections

        self.stop_server()
        if self.django_ready:
            connections.close_all()
        if self.owns_pg:
            self.pg('pg_ctl', 'stop', '-D', self.cluster, '-m', 'fast', '-w', '-t', '60')
            self.owns_pg = False
        return True

    def dispatch(self, req):
        action = req.get('action')
        if action == 'inspect':
            if self.state.get('intent') and not self.state.get('shop'):
                self.ensure_database()
                self.finish_setup()
            return {'shop': self.state.get('shop'), 'consent': self.state.get('consent', False), **self.public_config()}
        if action == 'initialize':
            return self.initialize()
        if action == 'migrate':
            return self.migrate(req.get('consent'))
        if action == 'status':
            return self.status()
        if action == 'setup':
            return self.setup(req['fields'], req['password'])
        if action == 'config':
            self.finish_setup()
            return self.public_config()
        if action == 'start':
            return self.start()
        if action == 'stop':
            return self.stop()
        raise ValueError('Unsupported service operation.')


def worker():
    from django.core.management.base import CommandError

    runtime = ShopRuntime()
    try:
        for raw in sys.stdin.buffer:
            try:
                with runtime.lock:
                    result = runtime.dispatch(json.loads(raw))
                reply = {'ok': True, 'value': result}
            except CommandError as exc:
                reply = {'ok': False, 'userMessage': str(exc)}
            except Exception:
                LOG.exception('Shop service operation failed')
                reply = {'ok': False, 'error': 'Tijori could not complete the operation. Check the service log.'}
            print(json.dumps(reply, ensure_ascii=True), flush=True)
    finally:
        with runtime.lock:
            runtime.stop()
