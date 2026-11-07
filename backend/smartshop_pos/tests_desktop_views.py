import os
import runpy
import secrets
from pathlib import Path
from tempfile import TemporaryDirectory
from types import ModuleType
from unittest import mock

from django.db import DatabaseError
from django.test import SimpleTestCase, override_settings

from smartshop_pos import urls


class DesktopViewTests(SimpleTestCase):
    def setUp(self):
        self.temp = Path(self.enterContext(TemporaryDirectory()))
        dist = self.temp / 'dist'
        static = self.temp / 'static'
        (dist / 'assets').mkdir(parents=True)
        static.mkdir()
        (dist / 'index.html').write_text('<html>Tijori</html>', encoding='utf-8')
        (dist / 'assets' / 'app.js').write_text('window.loaded = true;', encoding='utf-8')
        (static / 'screen.css').write_text('body { color: black }', encoding='utf-8')
        (dist / '.secret').write_text('private', encoding='utf-8')
        (self.temp / 'outside.txt').write_text('outside the served folder', encoding='utf-8')
        self.enterContext(override_settings(TIJORI_STATIC_DIR=str(static), TIJORI_FRONTEND_DIR=str(dist)))
        # Evaluate the real URL configuration with packaged assets enabled, without changing other tests' routes.
        routes = ModuleType('desktop_test_routes')
        routes.urlpatterns = runpy.run_path(urls.__file__)['urlpatterns']
        self.enterContext(override_settings(ROOT_URLCONF=routes))

    def test_root_and_deep_link_serve_the_same_shell(self):
        for url in ('/', '/inventory/products', '/orders/123'):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response['Content-Type'], 'text/html')
                self.assertEqual(response['Cache-Control'], 'no-cache')
                self.assertEqual(b''.join(response.streaming_content), b'<html>Tijori</html>')

    def test_asset_and_static_files_keep_browser_media_types(self):
        js = self.client.get('/assets/app.js')
        self.assertEqual(js['Content-Type'], 'text/javascript')
        self.assertIn('immutable', js['Cache-Control'])
        self.assertIn(b'loaded', b''.join(js.streaming_content))
        css = self.client.get('/static/screen.css')
        self.assertEqual(css['Content-Type'], 'text/css')
        self.assertNotIn('immutable', css['Cache-Control'])
        self.assertIn(b'black', b''.join(css.streaming_content))
        head = self.client.head('/assets/app.js')
        self.assertEqual(head.status_code, 200)
        head.close()
        self.assertEqual(self.client.post('/assets/app.js').status_code, 405)

    def test_api_misses_missing_assets_and_traversal_are_real_404s(self):
        for url in ('/api', '/api/unknown', '/assets/not-found', '/missing.js', '/static/missing.css', '/.secret',
                    '/assets/%2e%2e/%2e%2e/outside.txt', '/static/%2e%2e/outside.txt'):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 404)
                self.assertNotIn(b'<html>Tijori</html>', response.content)
                self.assertNotIn(b'outside the served folder', response.content)

    def test_health_exposes_only_this_process_identity_on_success(self):
        identity = secrets.token_urlsafe(18)
        with mock.patch.dict(os.environ, {'TIJORI_BOOT_ID': identity}), mock.patch('smartshop_pos.views.connection') as database:
            response = self.client.get('/api/health-check/')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['status'], 'ok')
            self.assertEqual(response['X-Tijori-Boot'], identity)
            database.ensure_connection.assert_called_once_with()
            self.assertEqual(self.client.post('/api/health-check/').status_code, 405)
            database.ensure_connection.side_effect = DatabaseError('offline')
            unavailable = self.client.get('/api/health-check/')
            self.assertEqual(unavailable.status_code, 503)
            self.assertNotIn('X-Tijori-Boot', unavailable)
