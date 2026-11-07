"""Home overview, Reports tabs, Analytics and drawer expenses."""

import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user
from customers.models import Customer
from finance.models import Expense
from inventory.models import StockMovement, default_branch
from inventory.services import move_stock
from sales.models import Shift, Terminal
from sales.tests import make_product


class PageBase(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.terminal = Terminal.objects.get(code='C1')
        self.shift = Shift.objects.create(terminal=self.terminal, opened_by=self.user, opening_cash=1000)
        self.today = timezone.localdate()
        self.product = make_product(self.user, stock=100, price=100)  # cost 60

    def sell(self, quantity=1, discount='0', method='cash', customer=None):
        total = self.product.price * quantity - Decimal(discount)
        response = self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk, 'discount': discount,
            'customer': customer.pk if customer else None,
            'lines': [{'product': self.product.pk, 'quantity': str(quantity)}],
            'payments': [{'method': method, 'amount': str(total)}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data


class DrawerExpenseTests(PageBase):
    def close(self, counted):
        return self.client.post(f'/api/sales/shifts/{self.shift.pk}/close/', {'counted_cash': str(counted)}, format='json')

    def test_cash_from_drawer_lowers_expected_cash(self):
        self.sell(quantity=3)  # +300 cash
        response = self.client.post('/api/finance/expenses/', {
            'category': 'transport', 'amount': '120', 'date': str(self.today), 'method': 'cash',
            'terminal': self.terminal.pk, 'note': 'Loader rickshaw',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['terminal_name'], 'Counter 1')
        closed = self.close(1180).data
        self.assertEqual(Decimal(closed['expected_cash']), Decimal(1180))
        report = self.client.get(f'/api/sales/shifts/{self.shift.pk}/z-report/').data
        self.assertEqual(report['paid_out'], '120.00')

    def test_bank_expense_does_not_touch_the_drawer(self):
        self.client.post('/api/finance/expenses/', {'category': 'rent', 'amount': '500', 'date': str(self.today), 'method': 'bank'}, format='json')
        self.assertEqual(Decimal(self.close(1000).data['expected_cash']), Decimal(1000))

    def test_rejects_bad_drawer_payouts(self):
        base = {'category': 'transport', 'amount': '50', 'date': str(self.today)}
        not_cash = self.client.post('/api/finance/expenses/', {**base, 'method': 'card', 'terminal': self.terminal.pk}, format='json')
        self.assertEqual(not_cash.status_code, 400)
        other = Terminal.objects.get(code='C2')
        no_shift = self.client.post('/api/finance/expenses/', {**base, 'method': 'cash', 'terminal': other.pk}, format='json')
        self.assertEqual(no_shift.status_code, 400)
        future = self.client.post('/api/finance/expenses/', {**base, 'date': str(self.today + timedelta(days=2))}, format='json')
        self.assertEqual(future.status_code, 400)
        unknown_method = self.client.post('/api/finance/expenses/', {**base, 'method': 'bitcoin'}, format='json')
        self.assertEqual(unknown_method.status_code, 400)
        self.assertEqual(Expense.objects.count(), 0)

    def test_cannot_delete_a_payout_from_a_counted_drawer(self):
        expense = self.client.post('/api/finance/expenses/', {
            'category': 'transport', 'amount': '50', 'date': str(self.today), 'method': 'cash', 'terminal': self.terminal.pk,
        }, format='json').data
        self.close(950)
        self.assertEqual(self.client.delete(f'/api/finance/expenses/{expense["id"]}/').status_code, 400)
        self.assertTrue(Expense.objects.filter(pk=expense['id']).exists())

    def test_month_summary_and_filters(self):
        self.sell(quantity=10)  # 1000 sales
        for category, amount, terminal in (('salaries', '60', None), ('transport', '40', self.terminal.pk)):
            self.client.post('/api/finance/expenses/', {
                'category': category, 'amount': amount, 'date': str(self.today), 'method': 'cash', 'terminal': terminal,
            }, format='json')
        data = self.client.get('/api/finance/expenses/summary/').data
        self.assertEqual(data['total'], 100)
        self.assertEqual(data['from_drawers'], 40)
        self.assertEqual(data['share_of_sales'], 10)
        self.assertEqual(data['by_category'][0]['category'], 'salaries')
        self.assertEqual(data['by_category'][0]['share'], 60)
        self.assertEqual(len(self.client.get('/api/finance/expenses/', {'search': 'transport'}).data), 1)
        self.assertEqual(self.client.get('/api/finance/expenses/summary/', {'month': '2026-13'}).status_code, 400)

    def test_expense_permissions(self):
        cashier = make_user(UserRole.CASHIER)
        client = APIClient()
        client.force_authenticate(cashier)
        self.assertEqual(client.get('/api/finance/expenses/summary/').status_code, 403)


class ReportPageTests(PageBase):
    def test_pnl_lines_add_up_and_include_write_offs(self):
        sale = self.sell(quantity=4, discount='40')  # subtotal 400, total 360
        self.client.post('/api/sales/returns/', {
            'client_uuid': str(uuid.uuid4()), 'sale': sale['id'], 'method': 'cash',
            'lines': [{'sale_line': sale['lines'][0]['id'], 'quantity': '1'}],
        }, format='json')
        move_stock(self.product, default_branch(), Decimal(-2), StockMovement.Reason.DAMAGE, self.user)  # 2 x 60
        data = self.client.get('/api/finance/report/').data
        self.assertEqual(data['gross_before_discounts'], 400)
        self.assertEqual(data['gross_before_discounts'] - data['returns'] - data['discounts'], data['net_sales'])
        self.assertEqual(data['stock_written_off'], 120)
        self.assertEqual(data['net_profit_after_write_offs'], data['net_profit'] - 120)
        self.assertEqual(data['margin_by_category'][0]['category'], self.product.category.name)

    def test_sections(self):
        customer = Customer.objects.create(name='Sana', credit_limit=Decimal(1000))
        self.sell(quantity=2, method='credit', customer=customer)
        for section in ('sales', 'stock', 'tax', 'cashiers', 'khata'):
            response = self.client.get(f'/api/finance/report/{section}/')
            self.assertEqual(response.status_code, 200, section)
        khata = self.client.get('/api/finance/report/khata/').data
        self.assertEqual(khata['customers'][0]['buckets']['0-30'], 200)
        self.assertEqual(khata['totals']['0-30'], 200)
        cashiers = self.client.get('/api/finance/report/cashiers/').data['cashiers']
        self.assertEqual(cashiers[0]['bills'], 1)
        stock = self.client.get('/api/finance/report/stock/').data
        self.assertEqual(stock['cost_value'], 98 * 60)
        self.assertEqual(self.client.get('/api/finance/report/nope/').status_code, 400)

    def test_ranges_are_validated(self):
        backwards = {'from': str(self.today), 'to': str(self.today - timedelta(days=3))}
        self.assertEqual(self.client.get('/api/finance/report/', backwards).status_code, 400)
        too_long = {'from': str(self.today - timedelta(days=800)), 'to': str(self.today)}
        self.assertEqual(self.client.get('/api/finance/report/sales/', too_long).status_code, 400)
        self.assertEqual(self.client.get('/api/finance/report/trend/', {'months': 99}).status_code, 400)

    def test_trend_has_one_row_per_month(self):
        self.sell(quantity=2)
        rows = self.client.get('/api/finance/report/trend/', {'months': 6}).data
        self.assertEqual(len(rows), 6)
        self.assertEqual(rows[-1]['net_sales'], 200)


class OverviewTests(PageBase):
    def test_every_period_answers_and_today_adds_up(self):
        customer = Customer.objects.create(name='Ali', area='Gulberg III')
        self.sell(quantity=2, customer=customer)
        self.sell(quantity=1)
        for period in ('today', 'yesterday', '7d', '30d'):
            self.assertEqual(self.client.get('/api/finance/overview/', {'period': period}).status_code, 200, period)
        data = self.client.get('/api/finance/overview/').data
        self.assertEqual(data['money']['gross_sales'], 300)
        self.assertEqual(data['money']['bills'], 2)
        self.assertEqual(data['customers']['served'], 2)
        self.assertEqual(data['customers']['new'], 1)
        self.assertEqual(data['customers']['walk_in'], 1)
        self.assertEqual(data['top_areas'][0]['area'], 'Gulberg III')
        self.assertEqual(data['registers'][0]['status'], 'open')
        self.assertEqual(data['registers'][0]['bills'], 2)
        self.assertEqual(data['payment_mix'][0]['share'], 100)
        self.assertEqual(len(data['trend']['points']), 24)
        self.assertEqual(self.client.get('/api/finance/overview/', {'period': 'decade'}).status_code, 400)

    def test_cashier_cannot_see_overview(self):
        client = APIClient()
        client.force_authenticate(make_user(UserRole.CASHIER))
        self.assertEqual(client.get('/api/finance/overview/').status_code, 403)


class AnalyticsTests(PageBase):
    def test_analytics_windows(self):
        customer = Customer.objects.create(name='Ali', area='Model Town')
        self.sell(customer=customer)
        self.sell(customer=customer)
        for days in (30, 90, 365):
            response = self.client.get('/api/finance/analytics/', {'days': days})
            self.assertEqual(response.status_code, 200, days)
        data = self.client.get('/api/finance/analytics/').data
        self.assertEqual(data['identified_customers'], 1)
        self.assertEqual(data['new_customers'], 1)
        self.assertEqual(data['areas'][0]['area'], 'Model Town')
        self.assertEqual(data['cohorts'][-1]['customers'], 1)
        self.assertEqual(data['cohorts'][-1]['retention'][0], 100)
        self.assertEqual(self.client.get('/api/finance/analytics/', {'days': 7}).status_code, 400)
