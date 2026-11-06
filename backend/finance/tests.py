import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from audit.services import log_event
from auth.models import UserRole
from auth.tests import make_user
from inventory.models import Batch, Product, default_branch
from sales.models import Shift, Terminal
from sales.tests import make_product


class FinanceBase(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.terminal = Terminal.objects.get(code='C1')
        self.shift = Shift.objects.create(terminal=self.terminal, opened_by=self.user, opening_cash=0)
        self.today = timezone.localdate()

    def sell(self, product, quantity=1, discount='0'):
        total = product.price * quantity - Decimal(discount)
        response = self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk, 'discount': discount,
            'lines': [{'product': product.pk, 'quantity': str(quantity)}],
            'payments': [{'method': 'cash', 'amount': str(total)}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data


class ReportTests(FinanceBase):
    def test_profit_and_loss(self):
        product = make_product(self.user, stock=100, price=100, sales_tax_percent=Decimal(25))  # cost 60
        sale = self.sell(product, quantity=4)  # 400 revenue, 240 cost, 80 tax
        self.client.post('/api/sales/returns/', {
            'client_uuid': str(uuid.uuid4()), 'sale': sale['id'], 'method': 'cash',
            'lines': [{'sale_line': sale['lines'][0]['id'], 'quantity': '1'}],
        }, format='json')  # -100 revenue, -60 cost, -20 tax
        self.client.post('/api/finance/expenses/', {'category': 'rent', 'amount': '50', 'date': str(self.today)}, format='json')
        data = self.client.get('/api/finance/report/').data
        self.assertEqual(data['gross_sales'], 400)
        self.assertEqual(data['returns'], 100)
        self.assertEqual(data['net_sales'], 300)
        self.assertEqual(data['cost_of_goods'], 180)
        self.assertEqual(data['gross_profit'], 120)
        self.assertEqual(data['expenses'], 50)
        self.assertEqual(data['net_profit'], 70)
        self.assertEqual(data['tax_collected'], 60)
        self.assertEqual(data['stock_value'], 97 * 60)
        self.assertEqual(data['by_category'][0]['revenue'], 400)

    def test_damaged_return_still_costs_the_shop(self):
        product = make_product(self.user, price=100)
        sale = self.sell(product)
        self.client.post('/api/sales/returns/', {
            'client_uuid': str(uuid.uuid4()), 'sale': sale['id'], 'method': 'cash',
            'lines': [{'sale_line': sale['lines'][0]['id'], 'quantity': '1', 'restock': False}],
        }, format='json')
        data = self.client.get('/api/finance/report/').data
        self.assertEqual(data['net_sales'], 0)
        self.assertEqual(data['cost_of_goods'], 60)

    def test_date_range_and_bad_input(self):
        self.client.post('/api/finance/expenses/', {'category': 'rent', 'amount': '50', 'date': '2020-01-01'}, format='json')
        self.assertEqual(self.client.get('/api/finance/report/').data['expenses'], 0)
        self.assertEqual(self.client.get('/api/finance/report/?from=2020-01-01&to=2020-01-01').data['expenses'], 50)
        self.assertEqual(self.client.get('/api/finance/report/?from=nope').status_code, 400)

    def test_expense_rules(self):
        self.assertEqual(self.client.post('/api/finance/expenses/', {'category': 'rent', 'amount': '0', 'date': str(self.today)}, format='json').status_code, 400)
        created = self.client.post('/api/finance/expenses/', {'category': 'rent', 'amount': '5', 'date': str(self.today)}, format='json').data
        self.assertEqual(self.client.delete(f"/api/finance/expenses/{created['id']}/").status_code, 204)
        cashier = APIClient()
        cashier.force_authenticate(make_user())
        for url in ('/api/finance/report/', '/api/finance/insights/', '/api/finance/expenses/'):
            self.assertEqual(cashier.get(url).status_code, 403, url)


class InsightTests(FinanceBase):
    def insights(self):
        return self.client.get('/api/finance/insights/').data

    def test_fast_seller_is_flagged_for_reorder(self):
        product = make_product(self.user, stock=10, barcode='fast')
        make_product(self.user, stock=500, barcode='slowfull')
        self.sell(product, quantity=8)
        row = next(item for item in self.insights()['reorder'] if item['name'] == product.name)
        self.assertEqual(row['stock'], 2)
        self.assertGreater(row['order_quantity'], 0)
        self.assertEqual(row['days_left'], Decimal('0.2'))
        self.assertNotIn('Item slowfull', [item['name'] for item in self.insights()['reorder']])

    def test_order_rounds_to_box_and_skips_unorderable(self):
        make_product(self.user, stock=0, barcode='box', box_pcs=12)
        make_product(self.user, stock=0, barcode='never', unorderable=True)
        rows = {item['name']: item for item in self.insights()['reorder']}
        self.assertEqual(rows['Item box']['order_quantity'] % 12, 0)
        self.assertNotIn('Item never', rows)

    def test_expiry_alerts_with_suggested_markdown(self):
        product = make_product(self.user, barcode='exp')
        branch = default_branch()
        Batch.objects.create(product=product, branch=branch, expiry_date=self.today + timedelta(days=5), quantity=3)
        Batch.objects.create(product=product, branch=branch, expiry_date=self.today + timedelta(days=20), quantity=2)
        Batch.objects.create(product=product, branch=branch, expiry_date=self.today - timedelta(days=1), quantity=1)
        Batch.objects.create(product=product, branch=branch, expiry_date=self.today + timedelta(days=200), quantity=9)
        rows = self.insights()['expiry']
        self.assertEqual([row['suggested_markdown'] for row in rows], [None, 30, 10])
        self.assertEqual(rows[1]['value_at_cost'], 180)

    def test_dead_stock(self):
        old = make_product(self.user, barcode='old')
        Product.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=90))
        make_product(self.user, barcode='new')
        self.assertEqual([row['name'] for row in self.insights()['dead_stock']], ['Item old'])

    def test_staff_review_flags_shortage_and_cleared_carts(self):
        product = make_product(self.user)
        self.sell(product)
        Shift.objects.filter(pk=self.shift.pk).update(closed_at=timezone.now(), closed_by=self.user, expected_cash=Decimal(100), counted_cash=Decimal(80))
        for _ in range(5):
            log_event(self.user, 'cart_cleared')
        row = self.insights()['staff'][0]
        self.assertEqual(row['cash_difference'], -20)
        self.assertEqual(row['flags'], ['cash_short', 'cleared_carts'])

    def test_staff_review_flags_unusual_discounts(self):
        product = make_product(self.user, stock=500)
        for _ in range(3):
            self.sell(product, quantity=2)
        other = make_user(UserRole.MANAGER)
        self.client.force_authenticate(other)
        self.sell(product, quantity=2, discount='100')
        rows = {row['name']: row for row in self.insights_as_owner()}
        self.assertIn('discounts', rows[other.full_name]['flags'])
        self.assertEqual(rows[self.user.full_name]['flags'], [])

    def insights_as_owner(self):
        self.client.force_authenticate(self.user)
        return self.insights()['staff']

    def test_money_analytics_uses_every_bill(self):
        product = make_product(self.user, stock=50)
        self.sell(product, quantity=2)
        money = self.insights()['money']
        self.assertEqual(money['window_days'], 30)
        self.assertEqual(money['invoices'], 1)
        self.assertGreater(Decimal(money['net_sales']), 0)
        self.assertEqual(len(money['daily']), 30)
        self.assertEqual(len(money['heatmap']), 7)
        self.assertEqual(len(money['heatmap'][0]), 24)
