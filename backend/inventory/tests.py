from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from auth.models import UserRole
from auth.tests import make_user
from inventory.models import Batch, Category, Product, StockLevel, StockMovement, default_branch
from inventory.services import add_batch, move_stock


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


class StockOperationTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.MANAGER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.product = Product.objects.create(name='Milk', barcode='m', category=Category.objects.first())
        self.today = timezone.localdate()
        branch = default_branch()
        move_stock(self.product, branch, Decimal(10), 'opening', self.user)
        add_batch(self.product, branch, Decimal(4), self.today + timedelta(days=5))
        add_batch(self.product, branch, Decimal(6), self.today + timedelta(days=50))

    def test_earliest_batch_sells_first_and_expiry_moves_on(self):
        self.product.refresh_from_db()
        self.assertEqual(self.product.expiry_date, self.today + timedelta(days=5))
        move_stock(self.product, default_branch(), Decimal(-5), 'sale', self.user)
        self.product.refresh_from_db()
        self.assertEqual(self.product.expiry_date, self.today + timedelta(days=50))
        self.assertEqual(sorted(b.quantity for b in Batch.objects.all()), [0, 5])

    def test_count_records_difference_with_reason(self):
        response = self.client.post(f'/api/inventory/products/{self.product.pk}/adjust/', {'counted': '7', 'reason': 'count'}, format='json')
        self.assertEqual(Decimal(response.data['stock']), 7)
        self.assertEqual(StockMovement.objects.get(reason='count').delta, -3)
        self.assertEqual(self.client.post(f'/api/inventory/products/{self.product.pk}/adjust/', {'counted': '-1', 'reason': 'count'}, format='json').status_code, 400)

    def test_write_off_expired_lets_fresh_stock_sell(self):
        Batch.objects.filter(quantity=4).update(expiry_date=self.today - timedelta(days=1))
        Product.objects.filter(pk=self.product.pk).update(expiry_date=self.today - timedelta(days=1))
        response = self.client.post(f'/api/inventory/products/{self.product.pk}/write-off-expired/')
        self.assertEqual(Decimal(response.data['stock']), 6)
        self.assertEqual(response.data['expiry_date'], str(self.today + timedelta(days=50)))
        self.assertEqual(StockMovement.objects.get(reason='expired').delta, -4)

    def test_stock_keeper_can_adjust_cashier_cannot(self):
        cashier = APIClient()
        cashier.force_authenticate(make_user())
        self.assertEqual(cashier.post(f'/api/inventory/products/{self.product.pk}/adjust/', {'counted': '1', 'reason': 'count'}, format='json').status_code, 403)


class ImportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_user(UserRole.MANAGER))

    def upload(self, text):
        return self.client.post('/api/inventory/products/import/', {'file': SimpleUploadedFile('p.csv', text.encode('utf-8-sig'))}, format='multipart')

    def test_good_rows_load_and_bad_rows_are_reported(self):
        response = self.upload(
            'name,barcode,category,cost,price,stock,sales_tax_percent\n'
            'Rice,100,grocery,80,100,5,0\n'
            'Dup,100,grocery,80,100,5,0\n'
            'Bad,101,grocery,80,-5,5,0\n'
            'Tea,102,NEW CAT,80,100,,18\n'
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 2)
        self.assertEqual([error['row'] for error in response.data['errors']], [3, 4])
        self.assertEqual(StockLevel.objects.get(product__barcode='100').quantity, 5)
        self.assertTrue(Category.objects.filter(name='NEW CAT').exists())

    def test_rejects_missing_and_non_utf8_files(self):
        self.assertEqual(self.client.post('/api/inventory/products/import/', {}, format='multipart').status_code, 400)
        bad = SimpleUploadedFile('p.csv', 'نام'.encode('utf-16'))
        self.assertEqual(self.client.post('/api/inventory/products/import/', {'file': bad}, format='multipart').status_code, 400)
