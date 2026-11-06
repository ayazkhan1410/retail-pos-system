from django.test import TestCase
from rest_framework.test import APIClient

from audit.services import log_event
from auth.models import CustomUser, UserRole


def make_owner():
    return CustomUser.objects.create_user(
        'owner-activity@test.local',
        'S3cure-pass-99',
        full_name='Owner',
        role=UserRole.OWNER,
    )


class ActivityListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_owner()
        self.client.force_authenticate(self.user)

    def test_activity_is_newest_first_and_paginated(self):
        for index in range(10):
            log_event(self.user, 'login', f'user-{index}')
        first = self.client.get('/api/audit/activity/', {'page_size': 4})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['count'], 10)
        self.assertEqual(len(first.data['results']), 4)
        ids = [row['id'] for row in first.data['results']]
        self.assertEqual(ids, sorted(ids, reverse=True))
        self.assertEqual(first.data['results'][0]['action'], 'login')
        self.assertIn('details', first.data['results'][0])

        second = self.client.get('/api/audit/activity/', {'page': 2, 'page_size': 4})
        self.assertEqual(len(second.data['results']), 4)
        self.assertTrue(second.data['results'][0]['id'] < first.data['results'][-1]['id'])

    def test_cashier_without_dashboard_cannot_read_activity(self):
        cashier = CustomUser.objects.create_user(
            'cashier-activity@test.local',
            'S3cure-pass-99',
            full_name='Cashier',
            role=UserRole.CASHIER,
        )
        self.client.force_authenticate(cashier)
        self.assertEqual(self.client.get('/api/audit/activity/').status_code, 403)
