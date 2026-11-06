from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user
from sales.tests import make_product


class ProductSearchTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.product = make_product(self.user, barcode='628100000001')
        Product = self.product.__class__
        Product.objects.filter(pk=self.product.pk).update(name='Olper Milk 1L')
        self.product.refresh_from_db()

    @override_settings(ELASTICSEARCH_URL='http://elasticsearch:9200')
    @mock.patch('inventory.views.search_product_ids')
    @mock.patch('inventory.views.products_for_ids')
    def test_search_endpoint_uses_elasticsearch_ids(self, products_for_ids, search_ids):
        search_ids.return_value = [self.product.pk]
        products_for_ids.return_value = [self.product]
        response = self.client.get('/api/inventory/products/search/', {'q': 'olper'})
        self.assertEqual(response.status_code, 200)
        search_ids.assert_called_once()
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['barcode'], self.product.barcode)

    @override_settings(ELASTICSEARCH_URL='')
    def test_search_fails_closed_without_elasticsearch(self):
        response = self.client.get('/api/inventory/products/search/', {'q': 'milk'})
        self.assertEqual(response.status_code, 503)
