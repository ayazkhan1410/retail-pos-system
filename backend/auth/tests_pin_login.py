"""PIN sign-in from the login screen: tills only, cashier-level roles only."""

from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user


class PinLoginTests(TestCase):
    def setUp(self):
        cache.clear()  # the login throttle counts across tests otherwise
        self.client = APIClient(enforce_csrf_checks=False)
        self.cashier = make_user(UserRole.CASHIER)
        self.cashier.pin = make_password('4321')
        self.cashier.save()
        self.manager = make_user(UserRole.MANAGER)
        self.manager.pin = make_password('9999')
        self.manager.save()

    def become_till(self):
        response = self.client.post('/api/auth/login/', {'email': self.cashier.email, 'password': 'S3cure-pass-99'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.client.post('/api/auth/logout/')

    def test_needs_a_till(self):
        response = self.client.post('/api/auth/pin-login/', {'pin': '4321'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.client.get('/api/auth/session/').data['pin_sign_in'])

    def test_cashier_signs_in_on_a_till(self):
        self.become_till()
        self.assertTrue(self.client.get('/api/auth/session/').data['pin_sign_in'])
        response = self.client.post('/api/auth/pin-login/', {'pin': '4321'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user']['email'], self.cashier.email)
        self.assertEqual(self.client.get('/api/auth/session/').data['user']['email'], self.cashier.email)

    def test_higher_roles_and_wrong_pins_are_refused(self):
        self.become_till()
        self.assertEqual(self.client.post('/api/auth/pin-login/', {'pin': '9999'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/auth/pin-login/', {'pin': '0000'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/auth/pin-login/', {'pin': 'abcd'}, format='json').status_code, 400)
        self.assertIsNone(self.client.get('/api/auth/session/').data['user'])

    def test_forged_till_cookie_is_ignored(self):
        self.client.cookies['tijori_till'] = '1:forged:signature'
        self.assertEqual(self.client.post('/api/auth/pin-login/', {'pin': '4321'}, format='json').status_code, 403)

    def test_disabled_cashier_cannot_sign_in(self):
        self.become_till()
        self.cashier.is_active = False
        self.cashier.save()
        self.assertEqual(self.client.post('/api/auth/pin-login/', {'pin': '4321'}, format='json').status_code, 400)
