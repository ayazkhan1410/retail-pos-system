"""Customer areas, segments, the summary strip and the profile panel."""

import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user
from customers.models import Customer
from sales.models import Sale, Shift, Terminal
from sales.tests import make_product


class SegmentTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.MANAGER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.terminal = Terminal.objects.get(code='C1')
        Shift.objects.create(terminal=self.terminal, opened_by=self.user, opening_cash=0)
        self.product = make_product(self.user, stock=50, price=100)

    def sell(self, customer, method='cash'):
        response = self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk, 'customer': customer.pk,
            'lines': [{'product': self.product.pk, 'quantity': '1'}],
            'payments': [{'method': method, 'amount': '100'}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def ids(self, **params):
        return {row['id'] for row in self.client.get('/api/customers/', params).data['results']}

    def test_area_is_saved_tidied_and_filterable(self):
        created = self.client.post('/api/customers/', {'name': 'Ali', 'area': '  Gulberg   III '}, format='json').data
        self.assertEqual(created['area'], 'Gulberg III')
        Customer.objects.create(name='Sana', area='Model Town')
        self.assertEqual(self.ids(area='gulberg iii'), {created['id']})
        self.assertIn('Gulberg III', self.client.get('/api/customers/summary/').data['areas'])

    def test_segments(self):
        regular = Customer.objects.create(name='Regular', credit_limit=Decimal(1000))
        self.sell(regular)
        self.sell(regular, method='credit')
        over = Customer.objects.create(name='Over', credit_limit=Decimal(100), balance=Decimal(250))
        lapsed = Customer.objects.create(name='Lapsed')
        sale = self.sell(lapsed)
        Sale.objects.filter(pk=sale['id']).update(created_at=timezone.now() - timedelta(days=45))
        Customer.objects.filter(pk__in=[regular.pk, over.pk, lapsed.pk]).update(created_at=timezone.now() - timedelta(days=60))
        fresh = Customer.objects.create(name='Fresh')

        self.assertEqual(self.ids(segment='regular'), {regular.pk})
        self.assertEqual(self.ids(segment='khata'), {regular.pk, over.pk})
        self.assertEqual(self.ids(segment='over_limit'), {over.pk})
        self.assertEqual(self.ids(segment='at_risk'), {lapsed.pk})
        self.assertEqual(self.ids(segment='new'), {fresh.pk})
        rows = {row['id']: row for row in self.client.get('/api/customers/').data['results']}
        self.assertEqual(rows[regular.pk]['segments'], ['regular', 'khata'])
        self.assertEqual(rows[over.pk]['segments'], ['over_limit', 'khata'])
        counts = self.client.get('/api/customers/summary/').data['counts']
        self.assertEqual(counts, {'regular': 1, 'khata': 2, 'over_limit': 1, 'at_risk': 1, 'new': 1})
        self.assertEqual(self.client.get('/api/customers/', {'segment': 'vip'}).status_code, 400)

    def test_ordering_by_last_visit(self):
        old, recent = Customer.objects.create(name='Old'), Customer.objects.create(name='Recent')
        Sale.objects.filter(pk=self.sell(old)['id']).update(created_at=timezone.now() - timedelta(days=10))
        self.sell(recent)
        names = [row['name'] for row in self.client.get('/api/customers/', {'ordering': 'last_visit'}).data['results']]
        self.assertEqual(names[:2], ['Recent', 'Old'])

    def test_profile(self):
        customer = Customer.objects.create(name='Ali', credit_limit=Decimal(5000))
        self.sell(customer)
        self.sell(customer)
        data = self.client.get(f'/api/customers/{customer.pk}/profile/').data
        self.assertEqual(data['visits'], 2)
        self.assertEqual(data['lifetime_spend'], 200)
        self.assertEqual(data['avg_bill'], 100)
        self.assertEqual(len(data['monthly_spend']), 6)
        self.assertEqual(data['monthly_spend'][-1]['spend'], 200)
        self.assertEqual(data['often_buys'][0]['times'], 2)
        self.assertEqual(self.client.get('/api/customers/999999/profile/').status_code, 404)
