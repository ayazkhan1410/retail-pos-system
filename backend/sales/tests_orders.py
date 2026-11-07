"""Orders page filters/summary, order status, and register management."""

import uuid
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user
from customers.models import Customer
from sales.models import Shift, Terminal
from sales.tests import make_product


class OrdersTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.MANAGER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.terminal = Terminal.objects.get(code='C1')
        Shift.objects.create(terminal=self.terminal, opened_by=self.user, opening_cash=0)
        self.product = make_product(self.user, stock=50, price=100)
        self.customer = Customer.objects.create(name='Sana Malik', phone='0333 902 1180', credit_limit=Decimal(1000))

    def sell(self, method='cash', customer=None, quantity=1):
        return self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk,
            'customer': customer.pk if customer else None,
            'lines': [{'product': self.product.pk, 'quantity': str(quantity)}],
            'payments': [{'method': method, 'amount': str(100 * quantity)}],
        }, format='json').data

    def test_search_by_customer_name_or_phone(self):
        self.sell(customer=self.customer)
        self.sell()
        self.assertEqual(self.client.get('/api/sales/', {'search': 'sana'}).data['count'], 1)
        self.assertEqual(self.client.get('/api/sales/', {'search': '902'}).data['count'], 1)

    def test_status_and_filters(self):
        khata = self.sell(method='credit', customer=self.customer)
        paid = self.sell(quantity=2)
        self.client.post('/api/sales/returns/', {
            'client_uuid': str(uuid.uuid4()), 'sale': paid['id'], 'method': 'cash',
            'lines': [{'sale_line': paid['lines'][0]['id'], 'quantity': '1'}],
        }, format='json')
        rows = {row['id']: row for row in self.client.get('/api/sales/').data['results']}
        self.assertEqual(rows[khata['id']]['status'], 'khata')
        self.assertEqual(rows[khata['id']]['customer_phone'], '0333 902 1180')
        self.assertEqual(rows[paid['id']]['status'], 'part_returned')
        self.assertEqual(self.client.get('/api/sales/', {'status': 'khata'}).data['count'], 1)
        self.assertEqual(self.client.get('/api/sales/', {'status': 'returned'}).data['count'], 1)
        self.assertEqual(self.client.get('/api/sales/', {'method': 'credit'}).data['count'], 1)
        self.assertEqual(self.client.get('/api/sales/', {'cashier': self.user.pk}).data['count'], 2)
        self.assertEqual(self.client.get('/api/sales/', {'status': 'bogus'}).status_code, 400)

    def test_summary_matches_the_table(self):
        self.sell(quantity=2)
        self.sell(quantity=4)
        data = self.client.get('/api/sales/summary/').data
        self.assertEqual(data['orders'], 2)
        self.assertEqual(data['revenue'], 600)
        self.assertEqual(data['avg_bill'], 300)
        self.assertEqual(data['orders_change'], 2)
        self.assertEqual(data['cashiers'][0]['cashier_id'], self.user.pk)

    def test_cashier_cannot_read_summary(self):
        client = APIClient()
        client.force_authenticate(make_user(UserRole.CASHIER))
        self.assertEqual(client.get('/api/sales/summary/').status_code, 403)


class RegisterSettingsTests(TestCase):
    def setUp(self):
        self.owner = make_user(UserRole.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_owner_adds_and_renames_a_register(self):
        created = self.client.post('/api/sales/terminals/', {'code': 'c3', 'name': 'Express lane'}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['code'], 'C3')
        renamed = self.client.patch(f'/api/sales/terminals/{created.data["id"]}/', {'name': 'Counter 3'}, format='json')
        self.assertEqual(renamed.data['name'], 'Counter 3')

    def test_register_rules(self):
        self.assertEqual(self.client.post('/api/sales/terminals/', {'code': 'C1', 'name': 'Dup'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/sales/terminals/', {'code': 'C-9', 'name': 'Bad'}, format='json').status_code, 400)
        terminal = Terminal.objects.get(code='C1')
        terminal.last_invoice_seq = 5
        terminal.save()
        recode = self.client.patch(f'/api/sales/terminals/{terminal.pk}/', {'code': 'C9'}, format='json')
        self.assertEqual(recode.status_code, 400)
        Shift.objects.create(terminal=terminal, opened_by=self.owner, opening_cash=0)
        retire = self.client.patch(f'/api/sales/terminals/{terminal.pk}/', {'active': False}, format='json')
        self.assertEqual(retire.status_code, 400)

    def test_cashier_can_list_but_not_add(self):
        client = APIClient()
        client.force_authenticate(make_user(UserRole.CASHIER))
        self.assertEqual(client.get('/api/sales/terminals/').status_code, 200)
        self.assertEqual(client.post('/api/sales/terminals/', {'code': 'C7', 'name': 'X'}, format='json').status_code, 403)
