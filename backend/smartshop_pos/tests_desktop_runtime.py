import io
import json
import os
import secrets
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from django.test import SimpleTestCase

from smartshop_pos.desktop_runtime import ShopRuntime


class DesktopRuntimeTests(SimpleTestCase):
    def setUp(self):
        self.temp = Path(self.enterContext(TemporaryDirectory()))
        data = self.temp / 'data'
        (data / 'state').mkdir(parents=True)
        (data / 'logs').mkdir()
        self.enterContext(mock.patch.dict(os.environ, {
            'TIJORI_RESOURCES': str(self.temp / 'resources'), 'TIJORI_DATA_DIR': str(data), 'APP_VERSION': '1.0.0',
        }))
        self.runtime = ShopRuntime()

    def test_first_migration_needs_explicit_consent_and_initialized_shop_database(self):
        with mock.patch.object(self.runtime, 'ensure_database') as check, mock.patch.object(self.runtime, 'command') as command:
            for consent, initialized, shop in ((False, True, None), ('true', True, None), (1, True, None),
                                                (True, False, None), (True, True, {'storeName': 'Existing'})):
                self.runtime.save(initialized=initialized, shop=shop)
                with self.subTest(consent=consent, initialized=initialized, shop=shop), self.assertRaises(RuntimeError):
                    self.runtime.dispatch({'action': 'migrate', 'consent': consent})
            check.assert_not_called()
            command.assert_not_called()
            self.runtime.save(managed=True, initialized=True, shop=None)
            self.assertTrue(self.runtime.dispatch({'action': 'migrate', 'consent': True}))
            check.assert_called_once_with()
            command.assert_called_once_with('migrate', interactive=False, verbosity=0)
            self.assertTrue(ShopRuntime().state['consent'])

    def test_failed_migration_leaves_confirmation_and_schema_pending(self):
        self.runtime.save(managed=True, initialized=True)
        with (
            mock.patch.object(self.runtime, 'ensure_database'),
            mock.patch.object(self.runtime, 'command', side_effect=RuntimeError('migration failed')),
            self.assertRaisesMessage(RuntimeError, 'migration failed'),
        ):
            self.runtime.migrate(True)
        state = ShopRuntime().state
        self.assertFalse(state.get('consent'))
        self.assertNotIn('schemaVersion', state)

    def test_existing_cluster_without_ownership_is_never_adopted(self):
        self.runtime.cluster.mkdir()
        marker = self.runtime.cluster / 'PG_VERSION'
        marker.write_text('16')
        with mock.patch.object(self.runtime, 'pg') as pg, self.assertRaisesMessage(RuntimeError, 'ownership'):
            self.runtime.initialize()
        pg.assert_not_called()
        self.assertEqual(marker.read_text(), '16')
        self.assertFalse(self.runtime.state_path.exists())

    def test_connection_to_different_cluster_is_closed_before_any_ddl(self):
        self.runtime.cluster.mkdir()
        self.runtime.save(managed=True, pgPort=55432)
        fake_driver = mock.Mock()
        connection = mock.MagicMock()
        fake_driver.connect.return_value = connection
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = (str(self.temp / 'unrelated-cluster'),)
        with (
            mock.patch.dict(sys.modules, {'psycopg2': fake_driver}),
            mock.patch.dict(os.environ, {'TIJORI_PG_BOOTSTRAP': secrets.token_urlsafe(24)}),
            mock.patch.object(self.runtime, 'pg', return_value=0),
            self.assertRaisesMessage(RuntimeError, 'different cluster'),
        ):
            self.runtime.ensure_database()
        cursor.execute.assert_called_once_with('SHOW data_directory')
        connection.close.assert_called_once_with()

    def test_recovers_committed_setup_without_creating_another_owner(self):
        self.runtime.save(managed=True, initialized=True, consent=True)
        password = secrets.token_urlsafe(24)
        fields = {'storeName': 'Tijori Market', 'branchName': 'Main', 'ownerName': 'Shop Owner',
                  'ownerEmail': 'OWNER@example.com', 'counters': 2}

        def commit_setup(command, **options):
            self.assertEqual(command, 'setup_shop')
            self.assertEqual(os.environ['TIJORI_OWNER_PASSWORD'], password)
            self.assertNotIn(password, repr(options))
            return json.dumps({'ok': True})

        with (
            mock.patch.object(self.runtime, 'command', side_effect=commit_setup) as command,
            mock.patch.object(self.runtime, 'finish_setup', side_effect=OSError('power loss')),
            self.assertRaisesMessage(OSError, 'power loss'),
        ):
            self.runtime.setup(fields, password)
        command.assert_called_once()
        self.assertNotIn('TIJORI_OWNER_PASSWORD', os.environ)
        self.assertNotIn(password, self.runtime.state_path.read_text())
        recovered = ShopRuntime()
        self.assertTrue(recovered.state.get('intent'))
        status = {'configured': True, 'owner_email': 'owner@example.com', 'store': 'Tijori Market', 'counters': 2}
        with mock.patch.object(recovered, 'ensure_database'), mock.patch.object(recovered, 'command', return_value=json.dumps(status)) as check:
            self.assertEqual(recovered.dispatch({'action': 'inspect'})['shop']['storeName'], 'Tijori Market')
        check.assert_called_once_with('setup_shop', status=True)
        self.assertIsNone(ShopRuntime().state['intent'])

    def test_recovery_requires_matching_owner_store_and_counters(self):
        self.runtime.save(consent=True, intent={'email': 'owner@example.com', 'storeName': 'Shop', 'branchName': 'Main', 'counters': 1})
        status = {'configured': True, 'owner_email': 'other@example.com', 'store': 'Shop', 'counters': 1}
        with mock.patch.object(self.runtime, 'status', return_value=status):
            self.runtime.finish_setup()
        self.assertFalse(self.runtime.state.get('shop'))
        for changed in ({'store': 'Different'}, {'counters': 2}):
            with (
                self.subTest(changed=changed),
                mock.patch.object(self.runtime, 'status', return_value={**status, 'owner_email': 'owner@example.com', **changed}),
                self.assertRaises(RuntimeError),
            ):
                self.runtime.finish_setup()
        self.assertFalse(ShopRuntime().state.get('shop'))

    def test_start_requires_healthy_response_from_this_server(self):
        self.runtime.save(consent=True, managed=True, initialized=True, shop={'storeName': 'Shop'}, schemaVersion='1.0.0')
        process = mock.Mock()
        process.poll.return_value = None
        self.enterContext(mock.patch.object(self.runtime, 'ensure_database'))
        self.enterContext(mock.patch('smartshop_pos.desktop_runtime.socket.getaddrinfo', return_value=[]))
        self.enterContext(mock.patch('smartshop_pos.desktop_runtime.available_port', return_value=8500))
        self.enterContext(mock.patch('smartshop_pos.desktop_runtime.subprocess.CREATE_NO_WINDOW', 0, create=True))
        spawn = self.enterContext(mock.patch('smartshop_pos.desktop_runtime.subprocess.Popen', return_value=process))
        self.enterContext(mock.patch('smartshop_pos.desktop_runtime.time.sleep'))
        replies = iter([('stale-instance', 'ok'), ('current', 'error'), ('current', 'ok')])

        def reply(url, *, timeout):
            boot, status = next(replies)
            self.assertEqual(url, 'http://127.0.0.1:8500/api/health-check/')
            self.assertIsNone(self.runtime.state.get('port'))
            response = io.BytesIO(json.dumps({'status': status}).encode())
            response.headers = {'X-Tijori-Boot': spawn.call_args.kwargs['env']['TIJORI_BOOT_ID'] if boot == 'current' else boot}
            return response

        with mock.patch('smartshop_pos.desktop_runtime.urlopen', side_effect=reply) as health:
            self.assertEqual(self.runtime.start()['port'], 8500)
        self.assertEqual(health.call_count, 3)
        self.assertEqual(ShopRuntime().state['port'], 8500)
        process.terminate.assert_not_called()
