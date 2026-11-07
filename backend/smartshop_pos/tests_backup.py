import os
import secrets
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event
from unittest import mock

from django.test import SimpleTestCase, override_settings

from smartshop_pos.services.backup import BackupError, create_database_backup


class BackupServiceTests(SimpleTestCase):
    def setUp(self):
        self.backup_dir = Path(self.enterContext(TemporaryDirectory()))
        self.enterContext(override_settings(BACKUP_DIR=self.backup_dir, TIME_ZONE='Asia/Karachi'))
        self.enterContext(mock.patch.dict(os.environ, {
            'POSTGRES_HOST': 'db', 'POSTGRES_PORT': '5432', 'POSTGRES_USER': 'smartshop',
            'POSTGRES_DB': 'smartshop', 'POSTGRES_PASSWORD': secrets.token_urlsafe(16),
        }))
        self.enterContext(mock.patch('smartshop_pos.services.backup.timezone.now',
                                     return_value=datetime(2026, 8, 1, 20, 30, tzinfo=UTC)))

    def write_dump(self, cmd, **kwargs):
        partial = Path(cmd[-1])
        self.assertEqual(partial.suffix, '.part')
        self.assertNotIn(kwargs['env']['PGPASSWORD'], cmd)
        partial.write_text('-- dump\n', encoding='utf-8')

    def test_requires_postgres_host(self):
        with mock.patch.dict(os.environ, {}, clear=True), self.assertRaises(BackupError):
            create_database_backup()

    def test_creates_sql_file_via_pg_dump(self):
        with mock.patch('smartshop_pos.services.backup.subprocess.run', side_effect=self.write_dump):
            result = create_database_backup()
        self.assertTrue(result['filename'].startswith('smartshop-'))
        self.assertGreater(result['size_bytes'], 0)
        self.assertTrue((self.backup_dir / result['filename']).exists())

    def test_manual_and_update_dumps_are_unique_even_in_the_same_second(self):
        with mock.patch('smartshop_pos.services.backup.subprocess.run', side_effect=self.write_dump):
            names = {create_database_backup(kind)['filename'] for kind in ('manual', 'manual', 'update', 'update')}
        self.assertEqual(len(names), 4)
        self.assertEqual(set(self.backup_dir.glob('*.sql')), {self.backup_dir / name for name in names})

    def test_daily_uses_shop_date_and_only_prunes_old_daily_dumps(self):
        old_name = 'smartshop-daily-2026-07-19.sql'
        preserved = [
            'smartshop-daily-2026-07-20.sql', 'smartshop-update-20260101.sql',
            'smartshop-manual-20260101.sql', 'smartshop-20260101.sql', 'smartshop-daily-special.sql',
        ]
        for name in [old_name, *preserved]:
            (self.backup_dir / name).write_text('older dump')
        with mock.patch('smartshop_pos.services.backup.subprocess.run', side_effect=self.write_dump) as dump:
            result = create_database_backup('daily')
            self.assertEqual(create_database_backup('daily'), result)
        dump.assert_called_once()
        self.assertEqual(result['filename'], 'smartshop-daily-2026-08-02.sql')
        self.assertFalse((self.backup_dir / old_name).exists())
        self.assertTrue(all((self.backup_dir / name).is_file() for name in preserved))

    def test_failed_dump_is_not_published_and_can_be_retried(self):
        old = self.backup_dir / 'smartshop-daily-2025-01-01.sql'
        old.write_text('keep until the new backup succeeds')

        def fail_after_partial_write(cmd, **kwargs):
            self.write_dump(cmd, **kwargs)
            self.assertEqual(list(self.backup_dir.glob('*.sql')), [old])
            raise subprocess.CalledProcessError(1, cmd, stderr='dump failed')

        with (
            mock.patch('smartshop_pos.services.backup.subprocess.run', side_effect=fail_after_partial_write),
            self.assertRaisesMessage(BackupError, 'dump failed'),
        ):
            create_database_backup('daily')
        self.assertTrue(old.exists())
        self.assertFalse(list(self.backup_dir.glob('*.part')))
        with mock.patch('smartshop_pos.services.backup.subprocess.run', side_effect=self.write_dump):
            result = create_database_backup('daily')
        self.assertTrue((self.backup_dir / result['filename']).exists())
        self.assertFalse(old.exists())

    def test_update_rejects_empty_or_missing_dump_executable(self):
        with mock.patch('smartshop_pos.services.backup.subprocess.run'), self.assertRaisesMessage(BackupError, 'empty backup'):
            create_database_backup('update')
        with mock.patch('smartshop_pos.services.backup.subprocess.run', side_effect=FileNotFoundError), self.assertRaises(BackupError):
            create_database_backup('update')
        self.assertEqual(list(self.backup_dir.iterdir()), [])

    def test_overlapping_daily_requests_run_pg_dump_once(self):
        started = Event()
        release = Event()

        def slow_dump(cmd, **kwargs):
            started.set()
            self.assertTrue(release.wait(5))
            self.write_dump(cmd, **kwargs)

        with (
            mock.patch('smartshop_pos.services.backup.subprocess.run', side_effect=slow_dump) as dump,
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            first = pool.submit(create_database_backup, 'daily')
            self.assertTrue(started.wait(5))
            second = pool.submit(create_database_backup, 'daily')
            release.set()
            self.assertEqual(first.result(timeout=7), second.result(timeout=7))
        dump.assert_called_once()
