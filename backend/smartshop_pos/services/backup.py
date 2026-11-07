import os
import subprocess
from datetime import date, datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4

from django.conf import settings
from django.core.files import locks
from django.utils import timezone


class BackupError(Exception):
    pass


def _dump(outfile):
    env = os.environ.copy()
    env['PGPASSWORD'] = os.getenv('POSTGRES_PASSWORD', '')
    # pg_dump needs to reopen the file by name on Windows. Publish only a completed, nonempty dump.
    with NamedTemporaryFile(dir=outfile.parent, prefix='.tijori-', suffix='.part', delete=False) as tmp:
        partial = Path(tmp.name)
    try:
        cmd = [
            os.getenv('TIJORI_PG_DUMP') or 'pg_dump', '--no-password',
            '-h', os.environ['POSTGRES_HOST'], '-p', os.getenv('POSTGRES_PORT', '5432'),
            '-U', os.getenv('POSTGRES_USER', 'smartshop'), '-d', os.getenv('POSTGRES_DB', 'smartshop'),
            '-f', str(partial),
        ]
        subprocess.run(cmd, env=env, check=True, capture_output=True, encoding='utf-8', errors='replace',
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if not partial.stat().st_size:
            raise BackupError('pg_dump produced an empty backup.')
        partial.replace(outfile)
    except subprocess.CalledProcessError as exc:
        raise BackupError(exc.stderr or 'pg_dump failed') from exc
    finally:
        partial.unlink(missing_ok=True)


def _details(outfile):
    stat = outfile.stat()
    return {
        'filename': outfile.name,
        'size_bytes': stat.st_size,
        'created_at': datetime.fromtimestamp(stat.st_mtime, tz=timezone.get_current_timezone()).isoformat(),
    }


def _prune_daily(backup_dir, today):
    oldest = today - timedelta(days=13)  # Today plus the preceding 13 shop dates.
    for path in backup_dir.glob('smartshop-daily-*.sql'):
        stamp = path.stem.removeprefix('smartshop-daily-')
        try:
            day = date.fromisoformat(stamp)
        except ValueError:
            continue
        if stamp == day.isoformat() and day < oldest and path.is_file():
            path.unlink(missing_ok=True)


def create_database_backup(kind: str = 'manual') -> dict:
    """Write a restorable SQL file. Repeated daily requests reuse today's completed dump."""
    if kind not in ('manual', 'daily', 'update'):
        raise BackupError('Unknown backup kind.')
    if not os.getenv('POSTGRES_HOST'):
        raise BackupError('Database backup requires PostgreSQL.')

    backup_dir = Path(settings.BACKUP_DIR)
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
        if kind == 'daily':
            # API workers and the desktop timer can run concurrently. The OS releases the lock on exit.
            with (backup_dir / '.daily-backup.lock').open('a+b') as lock:
                if not locks.lock(lock, locks.LOCK_EX):
                    raise BackupError('Could not lock the daily backup folder.')
                today = timezone.localdate()
                outfile = backup_dir / f'smartshop-daily-{today.isoformat()}.sql'
                if not outfile.exists() or not outfile.stat().st_size:
                    _dump(outfile)
                _prune_daily(backup_dir, today)
                return _details(outfile)
        stamp = timezone.localtime().strftime('%Y%m%d-%H%M%S')
        outfile = backup_dir / f'smartshop-{kind}-{stamp}-{uuid4().hex}.sql'
        _dump(outfile)
        return _details(outfile)
    except OSError as exc:
        raise BackupError(f'Could not complete database backup: {exc}') from exc
