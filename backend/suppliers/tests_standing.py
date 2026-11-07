"""Supplier due dates, balance filter, and the Purchases page summary."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user
from sales.tests import make_product
from suppliers.models import Supplier, SupplierLedgerEntry
from suppliers.services import post_supplier_entry


class StandingTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.supplier = Supplier.objects.create(name='Engro Foods', city='Lahore', payment_terms_days=10)

    def charge(self, amount, days_ago):
        entry = post_supplier_entry(self.supplier.pk, Decimal(amount), SupplierLedgerEntry.Kind.PURCHASE, self.user)
        SupplierLedgerEntry.objects.filter(pk=entry.pk).update(created_at=timezone.now() - timedelta(days=days_ago))

    def row(self, **params):
        data = self.client.get('/api/suppliers/', params).data
        return data, {row['id']: row for row in data['results']}

    def test_due_date_is_the_oldest_unpaid_delivery_plus_terms(self):
        self.charge(100, days_ago=20)
        self.charge(300, days_ago=4)
        post_supplier_entry(self.supplier.pk, Decimal(-100), SupplierLedgerEntry.Kind.PAYMENT, self.user)
        _, rows = self.row()
        expected = timezone.localdate() - timedelta(days=4) + timedelta(days=10)
        self.assertEqual(rows[self.supplier.pk]['due_date'], expected.isoformat())

    def test_no_due_date_when_settled_or_no_terms(self):
        self.charge(100, days_ago=3)
        post_supplier_entry(self.supplier.pk, Decimal(-100), SupplierLedgerEntry.Kind.PAYMENT, self.user)
        no_terms = Supplier.objects.create(name='Shan Foods')
        post_supplier_entry(no_terms.pk, Decimal(50), SupplierLedgerEntry.Kind.PURCHASE, self.user)
        _, rows = self.row()
        self.assertIsNone(rows[self.supplier.pk]['due_date'])
        self.assertIsNone(rows[no_terms.pk]['due_date'])

    def test_balance_filter_and_totals(self):
        self.charge(250, days_ago=1)
        Supplier.objects.create(name='Settled Co')
        data, rows = self.row(balance='owed')
        self.assertEqual(set(rows), {self.supplier.pk})
        self.assertEqual(data['total_owed'], 250)
        self.assertEqual(data['suppliers_owed'], 1)
        self.assertIn('Lahore', data['cities'])
        self.assertEqual(len(self.row(balance='settled')[1]), 1)

    def test_terms_are_validated(self):
        response = self.client.post('/api/suppliers/', {'name': 'Too Long', 'payment_terms_days': 900}, format='json')
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/api/suppliers/', {'name': 'Fine', 'payment_terms_days': 30}, format='json')
        self.assertEqual(response.status_code, 201, response.data)


class PurchaseSummaryTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.supplier = Supplier.objects.create(name='Engro Foods')
        self.product = make_product(self.user, stock=0, price=120)  # cost 60

    def grn(self, rate):
        return self.client.post('/api/purchases/', {
            'supplier': self.supplier.pk, 'date': str(timezone.localdate()), 'supplier_invoice_no': 'EF-77812',
            'lines': [{'product': self.product.pk, 'qty': '10', 'rate': str(rate)}],
        }, format='json').data

    def test_draft_shows_cost_change_and_invoice(self):
        draft = self.grn(66)
        self.assertEqual(draft['supplier_invoice_no'], 'EF-77812')
        listed = self.client.get('/api/purchases/', {'status': 'draft'}).data['results'][0]
        self.assertEqual(listed['lines'][0]['previous_cost'], '60.00')
        self.assertEqual(listed['created_by_name'], self.user.full_name)

    def test_summary_counts_drafts_posts_and_cost_moves(self):
        first = self.grn(60)
        self.client.post(f'/api/purchases/{first["id"]}/post/')
        second = self.grn(66)
        self.client.post(f'/api/purchases/{second["id"]}/post/')
        self.grn(70)  # draft
        data = self.client.get('/api/purchases/summary/').data
        self.assertEqual(data['month_deliveries'], 2)
        self.assertEqual(data['month_total'], 1260)
        self.assertEqual(data['drafts'], 1)
        self.assertEqual(data['drafts_total'], 700)
        self.assertEqual(data['cost_up'], 1)
        self.assertEqual(data['owed_total'], 1260)
        posted = {row['id']: row for row in self.client.get('/api/purchases/', {'status': 'posted'}).data['results']}
        self.assertEqual(posted[second['id']]['lines'][0]['previous_cost'], '60.00')
