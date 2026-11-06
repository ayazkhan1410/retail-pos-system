from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from auth.models import UserRole
from auth.tests import make_user
from inventory.models import Category, Product, StockLevel, StockMovement


class ProductApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_user(UserRole.MANAGER))

    def create(self, **extra):
        payload = {'name': 'Rice', 'barcode': '111', 'category': 'GROCERY', 'cost': '80', 'price': '100', 'stock': '10', **extra}
        return self.client.post('/api/inventory/products/', payload, format='json')

    def test_opening_stock_is_recorded_as_movement(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['stock']), 10)
        movement = StockMovement.objects.get()
        self.assertEqual((movement.delta, movement.reason), (Decimal(10), 'opening'))

    def test_stock_edit_records_only_the_difference(self):
        pk = self.create().data['id']
        response = self.client.patch(f'/api/inventory/products/{pk}/', {'stock': '7'}, format='json')
        self.assertEqual(Decimal(response.data['stock']), 7)
        self.assertEqual(StockMovement.objects.filter(reason='adjustment').get().delta, Decimal(-3))
        self.assertEqual(StockLevel.objects.get().quantity, 7)
        self.assertEqual([Decimal(v) for v in AuditLog.objects.filter(action='product_updated').get().details['stock']], [10, 7])

    def test_unrelated_edit_leaves_stock_alone(self):
        pk = self.create().data['id']
        self.client.patch(f'/api/inventory/products/{pk}/', {'name': 'Rice 5kg'}, format='json')
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_price_change_is_audited(self):
        pk = self.create().data['id']
        self.client.patch(f'/api/inventory/products/{pk}/', {'price': '120.00'}, format='json')
        self.assertEqual([Decimal(v) for v in AuditLog.objects.filter(action='product_updated').get().details['price']], [100, 120])

    def test_validation(self):
        self.create()
        self.assertEqual(self.create(name='Dup').status_code, 400)
        self.assertEqual(self.create(barcode='2', price='-1').status_code, 400)
        self.assertEqual(self.create(barcode='3', stock='-1').status_code, 400)
        self.assertEqual(self.create(barcode='4', category='NOPE').status_code, 400)
        self.assertEqual(self.create(barcode='5', sales_tax_percent='101').status_code, 400)
        self.assertEqual(self.create(barcode='6', disc_start='2026-02-01', disc_end='2026-01-01').status_code, 400)

    def test_delete_hides_product_but_keeps_it(self):
        pk = self.create().data['id']
        self.assertEqual(self.client.delete(f'/api/inventory/products/{pk}/').status_code, 204)
        self.assertEqual(self.client.get('/api/inventory/products/').data, [])
        self.assertEqual(len(self.client.get('/api/inventory/products/?include_inactive=1').data), 1)

    def test_cost_hidden_from_cashier(self):
        self.create()
        cashier = APIClient()
        cashier.force_authenticate(make_user())
        row = cashier.get('/api/inventory/products/').data[0]
        self.assertNotIn('cost', row)
        self.assertEqual(Decimal(row['stock']), 10)

    def test_history_cannot_be_edited_or_deleted(self):
        self.create()
        movement = StockMovement.objects.get()
        with self.assertRaises(ValueError):
            movement.save()
        with self.assertRaises(ValueError):
            movement.delete()


class SalePriceTests(TestCase):
    def product(self, **kwargs):
        return Product(name='P', barcode='x', category=Category.objects.first(), price=Decimal(100), **kwargs)

    def test_discounts(self):
        today = timezone.localdate()
        day = timedelta(days=1)
        self.assertEqual(self.product().sale_price(), 100)
        self.assertEqual(self.product(disc_percent=Decimal(10)).sale_price(), 90)
        self.assertEqual(self.product(disc_amount=Decimal(15)).sale_price(), 85)
        self.assertEqual(self.product(disc_amount=Decimal(500)).sale_price(), 0)
        self.assertEqual(self.product(disc_percent=Decimal(10), disc_start=today + day).sale_price(), 100)
        self.assertEqual(self.product(disc_percent=Decimal(10), disc_end=today - day).sale_price(), 100)
        self.assertEqual(self.product(disc_percent=Decimal(10), disc_start=today, disc_end=today).sale_price(), 90)
