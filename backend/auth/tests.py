from django.test import TestCase
from rest_framework.test import APIClient

from audit.models import AuditLog
from auth.models import CustomUser, RolePermission, UserRole


def make_user(role=UserRole.CASHIER, email=None):
    email = email or f'{role}@test.local'
    return CustomUser.objects.create_user(email, 'S3cure-pass-99', full_name=role.title(), role=role)


class AccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_anonymous_cannot_reach_business_data(self):
        for method, url in [
            ('get', '/api/suppliers/'), ('post', '/api/suppliers/bulk-delete/'), ('get', '/api/inventory/products/'),
            ('get', '/api/sales/'), ('post', '/api/sales/'), ('get', '/api/sales/dashboard/'),
            ('post', '/api/system/backup/'), ('get', '/api/auth/users/'), ('post', '/api/audit/events/'),
        ]:
            self.assertEqual(getattr(self.client, method)(url).status_code, 403, url)

    def test_health_check_is_public(self):
        self.assertEqual(self.client.get('/api/health-check/').status_code, 200)

    def test_login_logout_and_session(self):
        make_user()
        self.assertIsNone(self.client.get('/api/auth/session/').data['user'])
        bad = self.client.post('/api/auth/login/', {'email': 'cashier@test.local', 'password': 'wrong'}, format='json')
        self.assertEqual(bad.status_code, 400)
        good = self.client.post('/api/auth/login/', {'email': 'cashier@test.local', 'password': 'S3cure-pass-99'}, format='json')
        self.assertEqual(good.status_code, 200)
        self.assertEqual(self.client.get('/api/auth/session/').data['user']['role'], 'cashier')
        self.assertEqual(self.client.post('/api/auth/logout/').status_code, 204)
        self.assertIsNone(self.client.get('/api/auth/session/').data['user'])
        self.assertTrue(AuditLog.objects.filter(action='login_failed').exists())

    def test_writes_need_csrf_token_when_logged_in(self):
        make_user()
        client = APIClient(enforce_csrf_checks=True)
        client.post('/api/auth/login/', {'email': 'cashier@test.local', 'password': 'S3cure-pass-99'}, format='json')
        self.assertEqual(client.post('/api/auth/logout/').status_code, 403)

    def test_cashier_cannot_use_manager_areas(self):
        self.client.force_authenticate(make_user())
        for method, url in [
            ('get', '/api/suppliers/'), ('post', '/api/inventory/products/'), ('get', '/api/sales/'),
            ('get', '/api/sales/dashboard/'), ('post', '/api/system/backup/'), ('get', '/api/auth/users/'),
            ('patch', '/api/inventory/branch/'),
        ]:
            self.assertEqual(getattr(self.client, method)(url).status_code, 403, url)

    def test_only_owner_manages_staff_by_default(self):
        self.client.force_authenticate(make_user(UserRole.MANAGER))
        self.assertEqual(self.client.get('/api/auth/users/').status_code, 403)
        self.assertEqual(self.client.get('/api/auth/roles/').status_code, 403)

    def test_session_reports_permissions(self):
        self.client.force_authenticate(make_user())
        self.assertEqual(self.client.get('/api/auth/session/').data['user']['permissions'], ['customers.view', 'pos.sell'])

    def test_each_role_gets_only_its_areas(self):
        cases = [
            (UserRole.STOCK_KEEPER, '/api/suppliers/', 200),
            (UserRole.STOCK_KEEPER, '/api/sales/dashboard/', 403),
            (UserRole.ACCOUNTANT, '/api/sales/dashboard/', 200),
            (UserRole.ACCOUNTANT, '/api/auth/users/', 403),
        ]
        for role, url, expected in cases:
            self.client.force_authenticate(make_user(role, email=f'{role}{url.count("/")}{expected}@t.local'))
            self.assertEqual(self.client.get(url).status_code, expected, (role, url))

    def test_owner_edits_role_and_it_takes_effect(self):
        owner = make_user(UserRole.OWNER)
        cashier = make_user()
        self.client.force_authenticate(cashier)
        self.assertEqual(self.client.get('/api/sales/').status_code, 403)
        self.client.force_authenticate(owner)
        response = self.client.put('/api/auth/roles/', {'role': 'cashier', 'permissions': ['pos.sell', 'sales.view']}, format='json')
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(CustomUser.objects.get(pk=cashier.pk))
        self.assertEqual(self.client.get('/api/sales/').status_code, 200)
        self.client.force_authenticate(owner)
        self.assertEqual(self.client.put('/api/auth/roles/', {'role': 'owner', 'permissions': []}, format='json').status_code, 400)
        self.assertEqual(self.client.put('/api/auth/roles/', {'role': 'cashier', 'permissions': ['nope']}, format='json').status_code, 400)

    def test_staff_manager_cannot_create_or_edit_owners(self):
        owner = make_user(UserRole.OWNER)
        manager = make_user(UserRole.MANAGER)
        RolePermission.objects.create(role='manager', permission='staff.manage')
        self.client.force_authenticate(CustomUser.objects.get(pk=manager.pk))
        payload = {'email': 'x@t.local', 'full_name': 'X', 'role': 'owner', 'password': 'S3cure-pass-99'}
        self.assertEqual(self.client.post('/api/auth/users/', payload, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/auth/users/{owner.pk}/', {'password': 'S3cure-pass-99'}, format='json').status_code, 400)

    def test_owner_creates_staff_with_validated_password(self):
        owner = make_user(UserRole.OWNER)
        self.client.force_authenticate(owner)
        payload = {'email': 'new@test.local', 'full_name': 'New', 'role': 'cashier'}
        self.assertEqual(self.client.post('/api/auth/users/', {**payload, 'password': '123'}, format='json').status_code, 400)
        response = self.client.post('/api/auth/users/', {**payload, 'password': 'S3cure-pass-99'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertNotIn('password', response.data)
        self.assertTrue(CustomUser.objects.get(email='new@test.local').check_password('S3cure-pass-99'))

    def test_owner_cannot_lock_themselves_out(self):
        owner = make_user(UserRole.OWNER)
        self.client.force_authenticate(owner)
        self.assertEqual(self.client.patch(f'/api/auth/users/{owner.pk}/', {'is_active': False}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/auth/users/{owner.pk}/', {'role': 'cashier'}, format='json').status_code, 400)
