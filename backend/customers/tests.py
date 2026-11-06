import uuid
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user
from customers.models import Customer
from inventory.models import Category
from sales.models import Shift, Terminal
from sales.tests import make_product, stock_of


class KhataTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.MANAGER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.terminal = Terminal.objects.get(code='C1')
        self.shift = Shift.objects.create(terminal=self.terminal, opened_by=self.user, opening_cash=0)
        self.product = make_product(self.user, price=100)
        self.customer = Customer.objects.create(name='Ali', phone='0300', credit_limit=Decimal(500))

    def sell(self, amount='200', method='credit', customer=True):
        return self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk,
            'customer': self.customer.pk if customer else None,
            'lines': [{'product': self.product.pk, 'quantity': str(int(Decimal(amount) / 100))}],
            'payments': [{'method': method, 'amount': amount}],
        }, format='json')

    def test_credit_sale_adds_to_khata(self):
        self.assertEqual(self.sell().status_code, 201)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, 200)
        kinds = [entry['kind'] for entry in self.client.get(f'/api/customers/{self.customer.pk}/ledger/').data]
        self.assertEqual(kinds, ['sale'])

    def test_credit_limit_and_customer_required(self):
        self.assertEqual(self.sell(amount='600').status_code, 400)
        self.assertEqual(self.sell(customer=False).status_code, 400)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, 0)
        self.assertEqual(stock_of(self.product), 10)

    def test_payment_reduces_khata_and_counts_in_the_drawer(self):
        self.sell()
        response = self.client.post(f'/api/customers/{self.customer.pk}/ledger/', {'amount': '150', 'method': 'cash', 'terminal': self.terminal.pk}, format='json')
        self.assertEqual(Decimal(response.data['balance']), 50)
        closed = self.client.post(f'/api/sales/shifts/{self.shift.pk}/close/', {'counted_cash': '150'}, format='json').data
        self.assertEqual(Decimal(closed['expected_cash']), 150)

    def test_return_on_credit_reduces_khata(self):
        sale = self.sell().data
        self.client.post('/api/sales/returns/', {
            'client_uuid': str(uuid.uuid4()), 'sale': sale['id'], 'method': 'credit',
            'lines': [{'sale_line': sale['lines'][0]['id'], 'quantity': '1'}],
        }, format='json')
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, 100)

    def test_opening_balance_and_validation(self):
        data = self.client.post('/api/customers/', {'name': 'New', 'opening_balance': '75', 'credit_limit': '100'}, format='json').data
        self.assertEqual(Decimal(data['balance']), 75)
        self.assertEqual(self.client.post('/api/customers/', {'name': 'X', 'phone': '0300'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/customers/', {'name': 'X', 'credit_limit': '-1'}, format='json').status_code, 400)
        self.assertEqual(len(self.client.get('/api/customers/?search=ali').data['results']), 1)
        self.assertEqual(Category.objects.exists(), True)

    def test_cashier_can_look_up_but_not_edit_or_collect(self):
        cashier = APIClient()
        cashier.force_authenticate(make_user())
        self.assertEqual(cashier.get('/api/customers/').status_code, 200)
        self.assertEqual(cashier.post('/api/customers/', {'name': 'X'}, format='json').status_code, 403)
        self.assertEqual(cashier.post(f'/api/customers/{self.customer.pk}/ledger/', {'amount': '1', 'method': 'cash'}, format='json').status_code, 403)
