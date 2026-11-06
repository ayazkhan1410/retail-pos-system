import os
import subprocess
from datetime import datetime
from pathlib import Path

from django.conf import settings


class BackupError(Exception):
    pass


def create_database_backup() -> dict:
    if not os.getenv('POSTGRES_HOST'):
        raise BackupError('Database backup requires PostgreSQL (Docker stack).')

    backup_dir = Path(settings.BACKUP_DIR)
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise BackupError(f'Cannot use backup folder: {exc}') from exc

    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    filename = f'smartshop-{stamp}.sql'
    outfile = backup_dir / filename

    env = os.environ.copy()
    env['PGPASSWORD'] = os.getenv('POSTGRES_PASSWORD', '')

    cmd = [
        'pg_dump',
        '-h', os.getenv('POSTGRES_HOST', 'db'),
        '-p', os.getenv('POSTGRES_PORT', '5432'),
        '-U', os.getenv('POSTGRES_USER', 'smartshop'),
        '-d', os.getenv('POSTGRES_DB', 'smartshop'),
        '-f', str(outfile),
    ]

    try:
        subprocess.run(cmd, env=env, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        raise BackupError(exc.stderr or 'pg_dump failed') from exc
    except OSError as exc:
        raise BackupError(f'Could not run pg_dump: {exc}') from exc

    if not outfile.exists():
        raise BackupError('Backup file was not created.')

    stat = outfile.stat()
    return {
        'filename': filename,
        'size_bytes': stat.st_size,
        'created_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }
