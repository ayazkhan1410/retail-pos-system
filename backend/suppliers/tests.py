from django.test import TestCase
from rest_framework.test import APIClient

from auth.tests import make_user
from auth.models import UserRole
from inventory.models import Category, Product
from suppliers.models import Supplier


class SupplierTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_user(UserRole.MANAGER))
        self.supplier = Supplier.objects.create(name='Metro')

    def test_bad_ordering_falls_back_instead_of_crashing(self):
        for value in ('na-me', '--name', 'password'):
            self.assertEqual(self.client.get(f'/api/suppliers/?ordering={value}').status_code, 200)

    def test_duplicate_names_rejected_case_insensitively(self):
        self.assertEqual(self.client.post('/api/suppliers/', {'name': ' metro '}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/suppliers/{self.supplier.pk}/', {'name': 'Metro'}, format='json').status_code, 200)

    def test_balance_limits(self):
        self.assertEqual(self.client.post('/api/suppliers/', {'name': 'B', 'credit_balance': '-1'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/suppliers/', {'name': 'C', 'credit_balance': '100000000.00'}, format='json').status_code, 201)

    def test_supplier_with_products_cannot_be_deleted(self):
        Product.objects.create(name='P', barcode='1', category=Category.objects.first(), supplier=self.supplier)
        self.assertEqual(self.client.delete(f'/api/suppliers/{self.supplier.pk}/').status_code, 409)
        self.assertEqual(self.client.post('/api/suppliers/bulk-delete/', {'ids': [self.supplier.pk]}, format='json').status_code, 409)
        self.assertTrue(Supplier.objects.filter(pk=self.supplier.pk).exists())
