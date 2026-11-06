import threading
import uuid
from datetime import timedelta
from decimal import Decimal
from unittest import skipUnless

from django.db import connection, connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from auth.models import UserRole
from auth.tests import make_user
from inventory.models import Category, Product, StockLevel, StockMovement, default_branch
from inventory.services import move_stock
from sales.models import Sale, SaleLine, Shift, Terminal


def make_product(user, stock=10, price=100, barcode='111', **kwargs):
    product = Product.objects.create(
        name=f'Item {barcode}', barcode=barcode, category=Category.objects.first(),
        cost=Decimal(60), price=Decimal(price), **kwargs,
    )
    move_stock(product, default_branch(), Decimal(stock), 'opening', user)
    return product


def stock_of(product):
    return StockLevel.objects.get(product=product).quantity


class SaleTests(TestCase):
    def setUp(self):
        self.cashier = make_user()
        self.client = APIClient()
        self.client.force_authenticate(self.cashier)
        self.terminal = Terminal.objects.get(code='C1')
        self.shift = Shift.objects.create(terminal=self.terminal, opened_by=self.cashier, opening_cash=Decimal(1000))
        self.product = make_product(self.cashier)

    def sell(self, lines=None, payments=None, **extra):
        return self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()),
            'terminal': self.terminal.pk,
            'lines': lines if lines is not None else [{'product': self.product.pk, 'quantity': '2'}],
            'payments': payments if payments is not None else [{'method': 'cash', 'amount': '200'}],
            **extra,
        }, format='json')

    def test_sale_records_lines_payment_stock_and_invoice_number(self):
        response = self.sell(payments=[{'method': 'cash', 'amount': '500'}])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['invoice_no'], '01-C1-000001')
        self.assertEqual(Decimal(response.data['total']), 200)
        self.assertEqual(Decimal(response.data['change_due']), 300)
        self.assertEqual(stock_of(self.product), 8)
        movement = StockMovement.objects.get(reason='sale')
        self.assertEqual((movement.delta, movement.reference), (Decimal(-2), '01-C1-000001'))
        self.assertEqual(self.sell().data['invoice_no'], '01-C1-000002')

    def test_retry_with_same_uuid_does_not_sell_twice(self):
        payload = {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk,
            'lines': [{'product': self.product.pk, 'quantity': '1'}],
            'payments': [{'method': 'cash', 'amount': '100'}],
        }
        first = self.client.post('/api/sales/', payload, format='json')
        second = self.client.post('/api/sales/', payload, format='json')
        self.assertEqual((first.status_code, second.status_code), (201, 200))
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(stock_of(self.product), 9)

    def test_price_comes_from_server_not_client(self):
        response = self.sell(lines=[{'product': self.product.pk, 'quantity': '1', 'unit_price': '1', 'price': '1'}], payments=[{'method': 'cash', 'amount': '1'}])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)

    def test_tax_is_extracted_from_inclusive_price(self):
        taxed = make_product(self.cashier, price=118, barcode='222', sales_tax_percent=Decimal(18))
        response = self.sell(lines=[{'product': taxed.pk, 'quantity': '1'}], payments=[{'method': 'card', 'amount': '118'}])
        self.assertEqual(Decimal(response.data['total']), 118)
        self.assertEqual(Decimal(response.data['tax']), 18)
        self.assertEqual(Decimal(response.data['lines'][0]['tax_amount']), 18)

    def test_item_discount_is_applied(self):
        item = make_product(self.cashier, barcode='333', disc_percent=Decimal(10))
        response = self.sell(lines=[{'product': item.pk, 'quantity': '1'}], payments=[{'method': 'cash', 'amount': '90'}])
        self.assertEqual(Decimal(response.data['total']), 90)

    def test_expired_and_inactive_items_cannot_be_sold(self):
        expired = make_product(self.cashier, barcode='444', expiry_date=timezone.localdate() - timedelta(days=1))
        inactive = make_product(self.cashier, barcode='555', active=False)
        expires_today = make_product(self.cashier, barcode='666', expiry_date=timezone.localdate())
        for product, code in ((expired, 400), (inactive, 400), (expires_today, 201)):
            response = self.sell(lines=[{'product': product.pk, 'quantity': '1'}], payments=[{'method': 'cash', 'amount': '100'}])
            self.assertEqual(response.status_code, code, product.name)

    def test_selling_past_zero_is_allowed(self):
        response = self.sell(lines=[{'product': self.product.pk, 'quantity': '11'}], payments=[{'method': 'cash', 'amount': '1100'}])
        self.assertEqual(response.status_code, 201)
        self.assertEqual(stock_of(self.product), -1)

    def test_quantities(self):
        loose = make_product(self.cashier, barcode='777', qty_decimal=True)
        self.assertEqual(self.sell(lines=[{'product': self.product.pk, 'quantity': '1.5'}], payments=[{'method': 'cash', 'amount': '150'}]).status_code, 400)
        self.assertEqual(self.sell(lines=[{'product': loose.pk, 'quantity': '1.5'}], payments=[{'method': 'cash', 'amount': '150'}]).status_code, 201)
        self.assertEqual(self.sell(lines=[{'product': self.product.pk, 'quantity': '0'}]).status_code, 400)
        self.assertEqual(self.sell(lines=[{'product': self.product.pk, 'quantity': '-1'}]).status_code, 400)
        self.assertEqual(self.sell(lines=[]).status_code, 400)
        two = [{'product': self.product.pk, 'quantity': '1'}] * 2
        self.assertEqual(self.sell(lines=two).status_code, 400)

    def test_payment_rules(self):
        self.assertEqual(self.sell(payments=[{'method': 'cash', 'amount': '199.99'}]).status_code, 400)
        self.assertEqual(self.sell(payments=[{'method': 'card', 'amount': '300'}]).status_code, 400)
        self.assertEqual(self.sell(payments=[]).status_code, 400)
        split = self.sell(payments=[{'method': 'card', 'amount': '150', 'reference': 'R1'}, {'method': 'cash', 'amount': '100'}])
        self.assertEqual(split.status_code, 201)
        self.assertEqual(Decimal(split.data['change_due']), 50)
        self.assertEqual(stock_of(self.product), 8)

    def test_sale_writes_recent_activity_log(self):
        response = self.sell()
        self.assertEqual(response.status_code, 201)
        entry = AuditLog.objects.get(action='sale_completed')
        self.assertEqual(entry.target, response.data['invoice_no'])
        self.assertEqual(Decimal(entry.details['total']), Decimal(response.data['total']))
        self.assertFalse(entry.details['offline'])
        self.assertEqual(entry.details['terminal'], self.terminal.name)
        self.assertEqual(entry.details['items'], 1)
        self.assertIn(self.product.name, entry.details['summary'])

    def test_failed_sale_changes_nothing(self):
        before = self.terminal.last_invoice_seq
        self.sell(payments=[{'method': 'cash', 'amount': '1'}])
        self.terminal.refresh_from_db()
        self.assertEqual(self.terminal.last_invoice_seq, before)
        self.assertEqual(stock_of(self.product), 10)

    def test_no_sale_without_open_shift(self):
        Shift.objects.filter(pk=self.shift.pk).update(closed_at=timezone.now())
        self.assertEqual(self.sell().status_code, 400)

    def test_cashier_cannot_discount_but_manager_can(self):
        self.assertEqual(self.sell(discount='10').status_code, 403)
        self.client.force_authenticate(make_user(UserRole.MANAGER))
        response = self.sell(discount='10', payments=[{'method': 'cash', 'amount': '190'}])
        self.assertEqual(Decimal(response.data['total']), 190)
        self.assertTrue(AuditLog.objects.filter(action='sale_discount').exists())
        self.assertEqual(self.sell(discount='201').status_code, 400)

    def test_bill_discount_is_spread_exactly_across_lines(self):
        self.client.force_authenticate(make_user(UserRole.MANAGER))
        items = [make_product(self.cashier, barcode=f'9{i}', price=price) for i, price in enumerate((33, 33, 34))]
        response = self.sell(
            lines=[{'product': p.pk, 'quantity': '1'} for p in items],
            discount='10', payments=[{'method': 'cash', 'amount': '90'}],
        )
        self.assertEqual(response.status_code, 201, response.data)
        lines = SaleLine.objects.filter(sale_id=response.data['id'])
        self.assertEqual(sum(line.discount for line in lines), 10)
        self.assertEqual(sum(line.line_total for line in lines), 90)

    def test_old_invoices_keep_their_prices(self):
        sale_id = self.sell().data['id']
        Product.objects.filter(pk=self.product.pk).update(price=Decimal(999), name='Renamed')
        line = SaleLine.objects.get(sale_id=sale_id)
        self.assertEqual((line.unit_price, line.unit_cost, line.name), (Decimal(100), Decimal(60), 'Item 111'))


class ShiftTests(TestCase):
    def setUp(self):
        self.cashier = make_user()
        self.client = APIClient()
        self.client.force_authenticate(self.cashier)
        self.terminal = Terminal.objects.get(code='C1')
        self.product = make_product(self.cashier)

    def open(self, cash='1000'):
        return self.client.post('/api/sales/shifts/', {'terminal': self.terminal.pk, 'opening_cash': cash}, format='json')

    def test_only_one_open_shift_per_terminal(self):
        self.assertEqual(self.open().status_code, 201)
        self.assertEqual(self.open().status_code, 400)

    def test_close_works_out_expected_cash(self):
        shift_id = self.open().data['id']
        self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk,
            'lines': [{'product': self.product.pk, 'quantity': '3'}],
            'payments': [{'method': 'card', 'amount': '100'}, {'method': 'cash', 'amount': '500'}],
        }, format='json')  # Rs. 300 bill: 100 card, 200 cash, 300 change back
        current = self.client.get(f'/api/sales/terminals/{self.terminal.pk}/shift/').data['shift']
        self.assertEqual(current['sales_count'], 1)
        response = self.client.post(f'/api/sales/shifts/{shift_id}/close/', {'counted_cash': '1190'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(response.data['expected_cash']), 1200)
        self.assertEqual(AuditLog.objects.filter(action='shift_closed').get().details['difference'], '-10.00')
        self.assertEqual(self.client.post(f'/api/sales/shifts/{shift_id}/close/', {'counted_cash': '1'}, format='json').status_code, 400)
        self.assertIsNone(self.client.get(f'/api/sales/terminals/{self.terminal.pk}/shift/').data['shift'])
        self.assertEqual(self.open().status_code, 201)


class ReportTests(TestCase):
    def setUp(self):
        self.owner = make_user(UserRole.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.terminal = Terminal.objects.get(code='C1')
        Shift.objects.create(terminal=self.terminal, opened_by=self.owner, opening_cash=0)
        self.product = make_product(self.owner, stock=5, price=100)
        make_product(self.owner, stock=0, barcode='222')
        make_product(self.owner, stock=50, barcode='333')
        self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk,
            'lines': [{'product': self.product.pk, 'quantity': '2'}],
            'payments': [{'method': 'jazzcash', 'amount': '200'}],
        }, format='json')

    def test_dashboard_uses_real_numbers(self):
        data = self.client.get('/api/sales/dashboard/').data
        self.assertEqual(data['today_revenue'], 200)
        self.assertEqual(data['today_count'], 1)
        self.assertEqual(data['stock'], {'out': 1, 'low': 1, 'ok': 1})
        self.assertEqual(data['open_counters'], 1)
        self.assertEqual(data['sales_by_day'][-1]['Counter 1'], 200)
        self.assertEqual(len(data['sales_by_day']), 7)
        self.assertEqual(data['top_products'][0]['units'], 2)
        self.assertEqual(data['payment_methods'][0]['method'], 'jazzcash')

    def test_sales_list_filters(self):
        self.assertEqual(self.client.get('/api/sales/').data['count'], 1)
        self.assertEqual(self.client.get('/api/sales/').data['revenue'], 200)
        self.assertEqual(self.client.get('/api/sales/?search=NOPE').data['count'], 0)
        self.assertEqual(self.client.get('/api/sales/?from=2999-01-01').data['count'], 0)
        self.assertEqual(self.client.get('/api/sales/?from=garbage').status_code, 400)
        self.assertEqual(self.client.get('/api/sales/?terminal=abc').status_code, 400)


@skipUnless(connection.vendor == 'postgresql', 'Row locks need PostgreSQL')
class ConcurrencyTests(TransactionTestCase):
    """Two tills hitting the server at once, on real connections."""

    # Avoid serialized_rollback: other TransactionTestCases leave contenttypes that
    # clash with Django's deserialize of the post-migrate snapshot (UniqueViolation).
    def setUp(self):
        from auth.catalog import DEFAULT_ROLE_PERMISSIONS
        from auth.models import RolePermission
        from inventory.models import Branch, Category

        for role, codes in DEFAULT_ROLE_PERMISSIONS.items():
            for code in codes:
                RolePermission.objects.get_or_create(role=role, permission=code)
        branch, _ = Branch.objects.get_or_create(code='01', defaults={'name': 'Main Branch'})
        Category.objects.get_or_create(name='GROCERY')
        self.user = make_user(email=f'conc-{uuid.uuid4().hex[:8]}@test.local')
        self.terminals = []
        for code, name in (('C1', 'Counter 1'), ('C2', 'Counter 2')):
            terminal, _ = Terminal.objects.get_or_create(branch=branch, code=code, defaults={'name': name})
            self.terminals.append(terminal)
            Shift.objects.create(terminal=terminal, opened_by=self.user, opening_cash=0)
        self.product = make_product(self.user, stock=100, barcode=f'9{uuid.uuid4().hex[:11]}')

    def post_sales(self, payloads):
        results, barrier = [], threading.Barrier(len(payloads))

        def worker(payload):
            client = APIClient()
            client.force_authenticate(self.user)
            barrier.wait()
            results.append(client.post('/api/sales/', payload, format='json').status_code)
            connections.close_all()

        threads = [threading.Thread(target=worker, args=(payload,)) for payload in payloads]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        return results

    def payload(self, terminal, client_uuid=None):
        return {
            'client_uuid': client_uuid or str(uuid.uuid4()), 'terminal': terminal.pk,
            'lines': [{'product': self.product.pk, 'quantity': '1'}],
            'payments': [{'method': 'cash', 'amount': '100'}],
        }

    def test_parallel_sales_keep_stock_and_invoices_correct(self):
        results = self.post_sales([self.payload(self.terminals[i % 2]) for i in range(20)])
        self.assertEqual(results, [201] * 20)
        self.assertEqual(stock_of(self.product), 80)
        self.assertEqual(Sale.objects.values('invoice_no').distinct().count(), 20)
        self.assertEqual(sum(m.delta for m in StockMovement.objects.filter(product=self.product)), 80)

    def test_same_sale_sent_twice_at_once_posts_once(self):
        client_uuid = str(uuid.uuid4())
        results = self.post_sales([self.payload(self.terminals[0], client_uuid) for _ in range(6)])
        self.assertEqual(sorted(results), [200] * 5 + [201])
        self.assertEqual(Sale.objects.count(), 1)
        self.assertEqual(stock_of(self.product), 99)

    def test_closing_shift_during_sales_does_not_deadlock_or_lose_cash(self):
        shift = Shift.objects.get(terminal=self.terminals[0])
        results, barrier = [], threading.Barrier(9)

        def seller():
            client = APIClient()
            client.force_authenticate(self.user)
            barrier.wait()
            results.append(client.post('/api/sales/', self.payload(self.terminals[0]), format='json').status_code)
            connections.close_all()

        def closer():
            client = APIClient()
            client.force_authenticate(self.user)
            barrier.wait()
            results.append(client.post(f'/api/sales/shifts/{shift.pk}/close/', {'counted_cash': '0'}, format='json').status_code)
            connections.close_all()

        threads = [threading.Thread(target=seller) for _ in range(8)] + [threading.Thread(target=closer)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertNotIn(500, results)
        shift.refresh_from_db()
        self.assertEqual(shift.expected_cash, Decimal(100) * shift.sales.count())


class ReturnTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.MANAGER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.terminal = Terminal.objects.get(code='C1')
        self.shift = Shift.objects.create(terminal=self.terminal, opened_by=self.user, opening_cash=Decimal(1000))
        self.product = make_product(self.user, price=100)
        self.sale = self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk, 'discount': '20',
            'lines': [{'product': self.product.pk, 'quantity': '2'}],
            'payments': [{'method': 'cash', 'amount': '180'}],
        }, format='json').data
        self.line = self.sale['lines'][0]['id']

    def give_back(self, quantity='1', method='cash', restock=True, client_uuid=None):
        return self.client.post('/api/sales/returns/', {
            'client_uuid': client_uuid or str(uuid.uuid4()), 'sale': self.sale['id'], 'method': method,
            'lines': [{'sale_line': self.line, 'quantity': quantity, 'restock': restock}],
        }, format='json')

    def test_refund_is_what_was_really_paid_and_stock_returns(self):
        response = self.give_back()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['return']['total']), 90)  # 100 less half the bill discount
        self.assertEqual(stock_of(self.product), 9)
        self.assertEqual(Decimal(response.data['sale']['returned_total']), 90)
        self.assertEqual(Decimal(response.data['sale']['lines'][0]['returned_quantity']), 1)

    def test_cannot_return_more_than_sold(self):
        self.assertEqual(self.give_back('3').status_code, 400)
        self.give_back('1')
        self.give_back('1')
        self.assertEqual(self.give_back('1').status_code, 400)
        self.assertEqual(stock_of(self.product), 10)

    def test_damaged_item_is_not_restocked(self):
        self.give_back(restock=False)
        self.assertEqual(stock_of(self.product), 8)

    def test_retry_refunds_once(self):
        key = str(uuid.uuid4())
        self.assertEqual(self.give_back(client_uuid=key).status_code, 201)
        self.assertEqual(self.give_back(client_uuid=key).status_code, 200)
        self.assertEqual(stock_of(self.product), 9)

    def test_cash_refund_leaves_the_drawer(self):
        self.give_back()
        closed = self.client.post(f'/api/sales/shifts/{self.shift.pk}/close/', {'counted_cash': '1090'}, format='json').data
        self.assertEqual(Decimal(closed['expected_cash']), 1090)

    def test_cash_refund_needs_open_shift_but_wallet_does_not(self):
        Shift.objects.filter(pk=self.shift.pk).update(closed_at=timezone.now())
        self.assertEqual(self.give_back().status_code, 400)
        self.assertEqual(self.give_back(method='jazzcash').status_code, 201)

    def test_item_from_another_invoice_is_refused(self):
        other = self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk,
            'lines': [{'product': self.product.pk, 'quantity': '1'}],
            'payments': [{'method': 'cash', 'amount': '100'}],
        }, format='json').data
        self.line = other['lines'][0]['id']
        self.assertEqual(self.give_back().status_code, 400)

    def test_cashier_needs_permission(self):
        cashier = APIClient()
        cashier.force_authenticate(make_user())
        self.assertEqual(cashier.post('/api/sales/returns/', {}, format='json').status_code, 403)

    def test_dashboard_revenue_is_net_of_returns(self):
        self.give_back()
        self.assertEqual(self.client.get('/api/sales/dashboard/').data['today_revenue'], 90)

    def test_walk_in_return_without_invoice(self):
        before = stock_of(self.product)
        response = self.client.post('/api/sales/returns/', {
            'client_uuid': str(uuid.uuid4()),
            'terminal': self.terminal.pk,
            'method': 'cash',
            'reason': 'No receipt',
            'lines': [{'product': self.product.pk, 'quantity': '1', 'restock': True}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data['sale'])
        self.assertEqual(Decimal(response.data['return']['total']), 100)
        self.assertEqual(stock_of(self.product), before + 1)

    def test_walk_in_return_ignores_inflated_client_price(self):
        response = self.client.post('/api/sales/returns/', {
            'client_uuid': str(uuid.uuid4()),
            'terminal': self.terminal.pk,
            'method': 'cash',
            'lines': [{'product': self.product.pk, 'quantity': '1', 'unit_price': '9999', 'restock': True}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['return']['total']), 100)


class OfflineSaleTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.terminal = Terminal.objects.get(code='C1')
        self.shift = Shift.objects.create(terminal=self.terminal, opened_by=self.user, opening_cash=0)
        self.product = make_product(self.user, price=100)

    def sync(self, **line):
        return self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk, 'offline': True,
            'sold_at': (timezone.now() - timedelta(hours=2)).isoformat(),
            'lines': [{'product': self.product.pk, 'quantity': '1', **line}],
            'payments': [{'method': 'cash', 'amount': '100'}],
        }, format='json')

    def test_keeps_charged_price_and_flags_the_difference(self):
        Product.objects.filter(pk=self.product.pk).update(price=Decimal(150))
        response = self.sync(unit_price='100')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['is_offline'])
        self.assertEqual(Decimal(response.data['total']), 100)
        sale_log = AuditLog.objects.get(action='sale_completed')
        self.assertTrue(sale_log.details['offline'])
        self.assertEqual(sale_log.details['price_changes'][0]['current'], '150.00')
        self.assertLess(Sale.objects.get().created_at, timezone.now() - timedelta(hours=1))

    def test_syncs_after_item_or_shift_changed(self):
        Product.objects.filter(pk=self.product.pk).update(active=False)
        Shift.objects.filter(pk=self.shift.pk).update(closed_at=timezone.now())
        response = self.sync(unit_price='100')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Sale.objects.get().shift_id, self.shift.pk)

    def test_offline_credit_sale_updates_customer_balance(self):
        from customers.models import Customer

        customer = Customer.objects.create(name='Khata Ali', phone='03001112222', credit_limit=Decimal(5000))
        response = self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()),
            'terminal': self.terminal.pk,
            'offline': True,
            'sold_at': (timezone.now() - timedelta(hours=1)).isoformat(),
            'customer': customer.pk,
            'lines': [{'product': self.product.pk, 'quantity': '1', 'unit_price': '100'}],
            'payments': [{'method': 'credit', 'amount': '100'}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['is_offline'])
        customer.refresh_from_db()
        self.assertEqual(customer.balance, Decimal(100))

    def test_client_price_is_ignored_unless_offline(self):
        response = self.client.post('/api/sales/', {
            'client_uuid': str(uuid.uuid4()), 'terminal': self.terminal.pk,
            'lines': [{'product': self.product.pk, 'quantity': '1', 'unit_price': '1'}],
            'payments': [{'method': 'cash', 'amount': '1'}],
        }, format='json')
        self.assertEqual(response.status_code, 400)
