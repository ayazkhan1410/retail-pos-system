import os
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, override_settings

from smartshop_pos.services.backup import BackupError, create_database_backup


class BackupServiceTests(SimpleTestCase):
    def test_requires_postgres_host(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(BackupError):
                create_database_backup()

    @override_settings(BACKUP_DIR='/tmp/smartshop-backup-test')
    def test_creates_sql_file_via_pg_dump(self):
        backup_dir = Path('/tmp/smartshop-backup-test')
        backup_dir.mkdir(parents=True, exist_ok=True)
        for old in backup_dir.glob('smartshop-*.sql'):
            old.unlink()

        def fake_run(cmd, **kwargs):
            Path(cmd[-1]).write_text('-- dump\n', encoding='utf-8')
            return mock.Mock(returncode=0)

        with mock.patch.dict(os.environ, {
            'POSTGRES_HOST': 'db',
            'POSTGRES_PORT': '5432',
            'POSTGRES_USER': 'smartshop',
            'POSTGRES_DB': 'smartshop',
            'POSTGRES_PASSWORD': 'x',
        }):
            with mock.patch('smartshop_pos.services.backup.subprocess.run', side_effect=fake_run):
                result = create_database_backup()
        self.assertTrue(result['filename'].startswith('smartshop-'))
        self.assertGreater(result['size_bytes'], 0)
        self.assertTrue((backup_dir / result['filename']).exists())
