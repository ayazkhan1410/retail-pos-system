from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user
from inventory.models import Batch, Category, Product, StockLevel, StockMovement
from suppliers.models import Supplier, SupplierLedgerEntry


class GRNTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.MANAGER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.supplier = Supplier.objects.create(name='Lucky Beverages')
        category = Category.objects.first()
        self.a = Product.objects.create(name='A', barcode='a', category=category, cost=Decimal(90), price=Decimal(120))
        self.b = Product.objects.create(name='B', barcode='b', category=category, cost=Decimal(40), price=Decimal(60))

    def payload(self, **extra):
        return {
            'supplier': self.supplier.pk, 'date': str(timezone.localdate()),
            'lines': [
                {'product': self.a.pk, 'qty': '10', 'free': '0', 'rate': '100', 'retail': '130'},
                {'product': self.b.pk, 'qty': '10', 'free': '0', 'rate': '50', 'retail': '70'},
            ],
            **extra,
        }

    def create(self, **extra):
        response = self.client.post('/api/purchases/', self.payload(**extra), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def post(self, grn_id):
        return self.client.post(f'/api/purchases/{grn_id}/post/')

    def test_totals_with_every_adjustment(self):
        # 1500 subtotal, -10% (150), -50 flat = 1300; +5% tax (65) +100 freight +20 expense = 1485
        data = self.create(disc_percent='10', flat_disc='50', sales_tax_percent='5', freight='100', expense='20')
        self.assertEqual(Decimal(data['subtotal']), 1500)
        self.assertEqual(Decimal(data['total']), 1485)

    def test_line_discounts_and_freight(self):
        data = self.create(lines=[{'product': self.a.pk, 'qty': '10', 'rate': '100', 'disc': '50', 'disc_percent': '10', 'freight': '25'}])
        # 1000 - 50 - 100 + 25
        self.assertEqual(Decimal(data['lines'][0]['line_total']), 875)
        self.assertEqual(Decimal(data['lines'][0]['unit_cost']), Decimal('87.50'))

    def test_dispersal_changes_cost_but_not_bill_total(self):
        kept = self.create(flat_disc='150', disperse_discount=False)
        spread = self.create(flat_disc='150', disperse_discount=True)
        self.assertEqual(kept['total'], spread['total'])
        self.assertEqual(Decimal(kept['lines'][0]['unit_cost']), 100)
        self.assertEqual(Decimal(spread['lines'][0]['unit_cost']), 90)  # 10% of the bill
        freight = self.create(freight='150', disperse_discount=False, disperse_freight=True)
        self.assertEqual(Decimal(freight['lines'][0]['unit_cost']), 110)

    def test_free_units_lower_unit_cost(self):
        data = self.create(lines=[{'product': self.a.pk, 'qty': '10', 'free': '2', 'rate': '120', 'retail': '150'}])
        self.assertEqual(Decimal(data['lines'][0]['unit_cost']), 100)
        self.assertEqual(Decimal(data['lines'][0]['margin_percent']), Decimal('33.33'))

    def test_posting_receives_goods_and_charges_supplier(self):
        expiry = timezone.localdate() + timedelta(days=90)
        grn = self.create(lines=[
            {'product': self.a.pk, 'qty': '10', 'free': '2', 'rate': '100', 'retail': '150', 'expiry_date': str(expiry)},
        ])
        self.assertFalse(StockMovement.objects.exists())  # A draft touches nothing.
        response = self.post(grn['id'])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['number'], 'GRN-000001')
        self.assertEqual(StockLevel.objects.get(product=self.a).quantity, 12)
        self.assertEqual(StockMovement.objects.get().reason, 'purchase')
        self.assertEqual(Batch.objects.get().quantity, 12)
        self.a.refresh_from_db()
        self.supplier.refresh_from_db()
        self.assertEqual(self.a.price, 150)
        self.assertEqual(self.a.cost, Decimal('83.33'))
        self.assertEqual(self.a.expiry_date, expiry)
        self.assertEqual(self.supplier.credit_balance, 1000)
        self.assertEqual(SupplierLedgerEntry.objects.get().kind, 'purchase')

    def test_cash_purchase_leaves_supplier_balance_alone(self):
        self.post(self.create(payment_type='cash')['id'])
        self.supplier.refresh_from_db()
        self.assertEqual(self.supplier.credit_balance, 0)

    def test_manual_cost_is_not_overwritten(self):
        Product.objects.filter(pk=self.a.pk).update(costing_method='manual_cost')
        self.post(self.create()['id'])
        self.a.refresh_from_db()
        self.assertEqual(self.a.cost, 90)

    def test_posted_grn_is_locked(self):
        grn = self.create()
        self.post(grn['id'])
        self.assertEqual(self.post(grn['id']).status_code, 400)
        self.assertEqual(StockLevel.objects.get(product=self.a).quantity, 10)
        self.assertEqual(self.client.put(f"/api/purchases/{grn['id']}/", self.payload(), format='json').status_code, 400)
        self.assertEqual(self.client.delete(f"/api/purchases/{grn['id']}/").status_code, 400)

    def test_draft_can_be_edited_and_deleted(self):
        grn = self.create()
        response = self.client.put(f"/api/purchases/{grn['id']}/", self.payload(lines=[{'product': self.a.pk, 'qty': '1', 'rate': '10'}]), format='json')
        self.assertEqual(Decimal(response.data['total']), 10)
        self.assertEqual(len(response.data['lines']), 1)
        self.assertEqual(self.client.delete(f"/api/purchases/{grn['id']}/").status_code, 204)

    def test_preview_warns_about_margin(self):
        data = self.client.post('/api/purchases/preview/', self.payload(lines=[
            {'product': self.a.pk, 'qty': '10', 'rate': '125', 'retail': '120'},
        ]), format='json').data
        self.assertEqual(data['lines'][0]['warnings'], ['below_cost', 'cost_up'])

    def test_validation_and_permissions(self):
        self.assertEqual(self.client.post('/api/purchases/', self.payload(flat_disc='99999'), format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/purchases/', self.payload(lines=[{'product': self.a.pk, 'qty': '0', 'rate': '1'}]), format='json').status_code, 400)
        cashier = APIClient()
        cashier.force_authenticate(make_user())
        self.assertEqual(cashier.get('/api/purchases/').status_code, 403)
        self.assertEqual(self.post(999999).status_code, 400)

    def test_void_posted_grn_reverses_stock_and_supplier(self):
        grn = self.create()
        self.post(grn['id'])
        self.assertEqual(StockLevel.objects.get(product=self.a).quantity, 10)
        response = self.client.post(f"/api/purchases/{grn['id']}/void/", {'reason': 'Wrong delivery'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'voided')
        self.assertEqual(StockLevel.objects.get(product=self.a).quantity, 0)
        self.supplier.refresh_from_db()
        self.assertEqual(self.supplier.credit_balance, 0)
        self.assertEqual(self.client.post(f"/api/purchases/{grn['id']}/void/", {}, format='json').status_code, 400)

    def test_purchase_return_posts_and_reduces_stock(self):
        grn = self.create()
        self.post(grn['id'])
        payload = {
            'supplier': self.supplier.pk,
            'grn': grn['id'],
            'date': str(timezone.localdate()),
            'reason': 'Damaged',
            'lines': [{'product': self.a.pk, 'quantity': '2', 'rate': '100'}],
        }
        created = self.client.post('/api/purchases/returns/', payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        posted = self.client.post(f"/api/purchases/returns/{created.data['id']}/post/")
        self.assertEqual(posted.status_code, 200, posted.data)
        self.assertTrue(posted.data['number'].startswith('PR-'))
        self.assertEqual(StockLevel.objects.get(product=self.a).quantity, 8)
        self.supplier.refresh_from_db()
        self.assertEqual(self.supplier.credit_balance, 1300)


class SupplierLedgerTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_user(UserRole.MANAGER))

    def test_opening_balance_and_payment_flow_through_ledger(self):
        supplier = self.client.post('/api/suppliers/', {'name': 'S', 'credit_balance': '1000'}, format='json').data
        url = f"/api/suppliers/{supplier['id']}/ledger/"
        self.assertEqual(Decimal(supplier['credit_balance']), 1000)
        response = self.client.post(url, {'amount': '400', 'method': 'bank', 'reference': 'CHQ1'}, format='json')
        self.assertEqual(Decimal(response.data['credit_balance']), 600)
        self.assertEqual([entry['kind'] for entry in self.client.get(url).data], ['payment', 'opening'])
        self.assertEqual(self.client.post(url, {'amount': '-1', 'method': 'bank'}, format='json').status_code, 400)

    def test_balance_cannot_be_edited_directly(self):
        supplier = self.client.post('/api/suppliers/', {'name': 'S', 'credit_balance': '100'}, format='json').data
        data = self.client.patch(f"/api/suppliers/{supplier['id']}/", {'credit_balance': '0'}, format='json').data
        self.assertEqual(Decimal(data['credit_balance']), 100)
