from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user
from sales.models import HeldBill, Shift, Terminal
from sales.tests import make_product


class HeldBillTests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.CASHIER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.terminal = Terminal.objects.get(code='C1')
        Shift.objects.create(terminal=self.terminal, opened_by=self.user, opening_cash=0)
        self.product = make_product(self.user, price=100)

    def test_hold_list_and_delete(self):
        create = self.client.post('/api/sales/held/', {
            'terminal': self.terminal.pk,
            'label': 'Table 3',
            'lines': [{
                'product_id': self.product.pk,
                'quantity': '2',
                'name': self.product.name,
                'barcode': self.product.barcode,
                'unit_price': '100.00',
            }],
        }, format='json')
        self.assertEqual(create.status_code, 201, create.data)
        self.assertEqual(create.data['label'], 'Table 3')
        self.assertEqual(create.data['item_count'], 1)
        self.assertEqual(Decimal(create.data['subtotal']), Decimal('200.00'))

        listed = self.client.get('/api/sales/held/', {'terminal': self.terminal.pk})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 1)

        deleted = self.client.delete(f'/api/sales/held/{create.data["id"]}/')
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(HeldBill.objects.exists())

    def test_z_report_for_shift(self):
        shift = Shift.objects.get(terminal=self.terminal, closed_at__isnull=True)
        response = self.client.get(f'/api/sales/shifts/{shift.pk}/z-report/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['terminal'], self.terminal.name)
        self.assertEqual(response.data['sales_count'], 0)
