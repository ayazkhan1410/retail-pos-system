import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from django.test import SimpleTestCase

from smartshop_pos.desktop_runtime import ShopRuntime


class DesktopUpdateTests(SimpleTestCase):
    def setUp(self):
        data = Path(self.enterContext(TemporaryDirectory()))
        (data / 'state').mkdir()
        self.enterContext(mock.patch.dict(os.environ, {
            'TIJORI_DATA_DIR': str(data), 'TIJORI_RESOURCES': str(data / 'resources'), 'APP_VERSION': '2.0.0',
        }))
        self.runtime = ShopRuntime()
        self.runtime.save(managed=True, initialized=True, consent=True, schemaVersion='1.0.0', shop={'storeName': 'Shop'})
        self.enterContext(mock.patch.object(self.runtime, 'ensure_database'))

    def test_update_install_requires_completed_backup_and_resumes_service_on_failure(self):
        calls = mock.Mock()
        with (
            mock.patch.object(self.runtime, 'stop_server', calls.stop),
            mock.patch.object(self.runtime, 'backup', calls.backup),
            mock.patch.object(self.runtime, 'start', calls.start),
        ):
            calls.backup.side_effect = OSError('disk full')
            with self.assertRaisesMessage(OSError, 'disk full'):
                self.runtime.dispatch({'action': 'beforeUpdate'})
        self.assertEqual(calls.mock_calls, [mock.call.stop(), mock.call.backup('update'), mock.call.start()])
        self.assertEqual(ShopRuntime().state['schemaVersion'], '1.0.0')

    def test_first_launch_after_update_never_migrates_without_backup(self):
        with (
            mock.patch.object(self.runtime, 'backup', side_effect=OSError('disk full')),
            mock.patch.object(self.runtime, 'command') as migrate,
            self.assertRaisesMessage(OSError, 'disk full'),
        ):
            self.runtime.start()
        migrate.assert_not_called()
        self.assertEqual(ShopRuntime().state['schemaVersion'], '1.0.0')

    def test_failed_upgrade_migration_is_retried_after_another_backup(self):
        actions = mock.Mock()
        # Running server avoids a subprocess launch once the mocked migration succeeds.
        self.runtime.server = mock.Mock()
        self.runtime.server.poll.return_value = None
        actions.command.side_effect = [RuntimeError('failed migration'), None]
        with mock.patch.object(self.runtime, 'backup', actions.backup), mock.patch.object(self.runtime, 'command', actions.command):
            with self.assertRaisesMessage(RuntimeError, 'failed migration'):
                self.runtime.start()
            self.assertEqual(ShopRuntime().state['schemaVersion'], '1.0.0')
            self.runtime.start()
            self.assertEqual(ShopRuntime().state['schemaVersion'], '2.0.0')
        expected = [mock.call.backup('update'), mock.call.command('migrate', interactive=False, verbosity=0)]
        self.assertEqual(actions.mock_calls, expected * 2)
