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
    def test_without_elasticsearch_the_database_answers(self):
        response = self.client.get('/api/inventory/products/search/', {'q': 'milk'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data['results']], [self.product.pk])

    @override_settings(ELASTICSEARCH_URL='')
    def test_database_ranking_and_filters(self):
        from inventory.models import ProductBarcode
        prefix = make_product(self.user, barcode='6281000000019')
        Product = prefix.__class__
        Product.objects.filter(pk=prefix.pk).update(name='Zinger Box')
        hidden = make_product(self.user, barcode='999')
        Product.objects.filter(pk=hidden.pk).update(name='Olper Cream', active=False)
        ProductBarcode.objects.create(product=hidden, barcode='EXTRA-77')

        def ids(q, **params):
            return [row['id'] for row in self.client.get('/api/inventory/products/search/', {'q': q, **params}).data['results']]

        # Exact barcode beats a longer barcode that merely starts with it.
        self.assertEqual(ids('628100000001')[:2], [self.product.pk, prefix.pk])
        self.assertEqual(ids('olper'), [self.product.pk])
        self.assertEqual(ids('olper', include_inactive='1'), [hidden.pk, self.product.pk])
        self.assertEqual(ids('extra-77', include_inactive='1'), [hidden.pk])
        self.assertEqual(ids('nothing-like-this'), [])

    @override_settings(ELASTICSEARCH_URL='http://elasticsearch:9200')
    @mock.patch('inventory.services.search.get_client', side_effect=ConnectionError('down'))
    def test_elasticsearch_down_falls_back_to_the_database(self, _client):
        response = self.client.get('/api/inventory/products/search/', {'q': 'olper'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
