from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from auth.models import UserRole
from auth.tests import make_user
from inventory.models import Branch, Category, Product, StockLevel, StockMovement
from inventory.services import move_stock
from notifications.models import Notification
from notifications.services import notify_stock_level, scan_expiry_alerts, stock_dedupe_key


class NotificationAPITests(TestCase):
    def setUp(self):
        self.user = make_user(UserRole.OWNER, email='owner-notify@test.local')
        self.client = APIClient()
        self.client.force_login(self.user)
        self.other = make_user(UserRole.CASHIER, email='cashier-notify@test.local')

    def test_list_only_own_notifications(self):
        Notification.objects.create(
            recipient=self.user,
            kind=Notification.Kind.LOW_STOCK,
            title='Mine',
            body='x',
        )
        Notification.objects.create(
            recipient=self.other,
            kind=Notification.Kind.LOW_STOCK,
            title='Theirs',
            body='y',
        )
        response = self.client.get('/api/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['title'], 'Mine')

    def test_mark_read(self):
        note = Notification.objects.create(
            recipient=self.user,
            kind=Notification.Kind.LOW_STOCK,
            title='Low',
        )
        response = self.client.post('/api/notifications/mark-read/', {'ids': [note.id]}, format='json')
        self.assertEqual(response.status_code, 200)
        note.refresh_from_db()
        self.assertIsNotNone(note.read_at)

    def test_stream_returns_event_stream(self):
        response = self.client.get('/api/notifications/stream/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/event-stream')
        chunk = next(response.streaming_content)
        self.assertIn(b'event: connected', chunk)
        response.close()

    def test_stream_rejects_anonymous(self):
        anon = APIClient()
        response = anon.get('/api/notifications/stream/')
        self.assertIn(response.status_code, (401, 403))


class NotificationStockAlertTests(TransactionTestCase):
    def setUp(self):
        self.owner = make_user(UserRole.OWNER, email='owner2-notify@test.local')
        self.branch = Branch.objects.create(code='M1', name='Main')
        self.category = Category.objects.create(name='NOTIFY-GROCERY')
        self.product = Product.objects.create(
            barcode='200000000001',
            name='Test Rice',
            category=self.category,
            cost=Decimal(100),
            price=Decimal(150),
            threshold=Decimal(10),
        )
        StockLevel.objects.create(product=self.product, branch=self.branch, quantity=Decimal(20))

    def test_low_stock_dedupes_instead_of_repeating(self):
        notify_stock_level(self.product, self.branch, Decimal(5))
        notify_stock_level(self.product, self.branch, Decimal(4))
        key = stock_dedupe_key(self.product.pk, self.branch.pk)
        notes = Notification.objects.filter(recipient=self.owner, dedupe_key=key, read_at__isnull=True)
        self.assertEqual(notes.count(), 1)
        note = notes.get()
        self.assertEqual(note.payload.get('quantity'), '4')
        self.assertEqual(note.kind, Notification.Kind.LOW_STOCK)
        self.assertEqual(note.payload.get('i18n_key'), 'notifications.alerts.lowStock')

    def test_low_stock_stays_quiet_after_read_until_restock(self):
        notify_stock_level(self.product, self.branch, Decimal(5))
        key = stock_dedupe_key(self.product.pk, self.branch.pk)
        note = Notification.objects.get(recipient=self.owner, dedupe_key=key)
        note.read_at = timezone.now()
        note.save(update_fields=['read_at'])
        notify_stock_level(self.product, self.branch, Decimal(3))
        self.assertEqual(Notification.objects.filter(dedupe_key=key).count(), 1)
        notify_stock_level(self.product, self.branch, Decimal(50))
        notify_stock_level(self.product, self.branch, Decimal(2))
        self.assertEqual(
            Notification.objects.filter(recipient=self.owner, dedupe_key=key, read_at__isnull=True).count(),
            1,
        )

    def test_restock_clears_alerts(self):
        notify_stock_level(self.product, self.branch, Decimal(2))
        key = stock_dedupe_key(self.product.pk, self.branch.pk)
        self.assertEqual(
            Notification.objects.filter(dedupe_key=key, read_at__isnull=True).count(),
            1,
        )
        notify_stock_level(self.product, self.branch, Decimal(50))
        self.assertEqual(
            Notification.objects.filter(dedupe_key=key, read_at__isnull=True).count(),
            0,
        )

    def test_move_stock_notifies_after_commit(self):
        move_stock(
            self.product,
            self.branch,
            Decimal(-15),
            StockMovement.Reason.SALE,
            self.owner,
        )
        key = stock_dedupe_key(self.product.pk, self.branch.pk)
        self.assertTrue(
            Notification.objects.filter(dedupe_key=key, read_at__isnull=True).exists(),
        )

    def test_expiry_scan_without_stock_change(self):
        self.product.track_expiry = True
        self.product.expiry_date = timezone.localdate() + timedelta(days=2)
        self.product.save(update_fields=['track_expiry', 'expiry_date'])
        scan_expiry_alerts(force=True)
        self.assertTrue(
            Notification.objects.filter(
                kind=Notification.Kind.EXPIRY_SOON,
                payload__product_id=self.product.pk,
                read_at__isnull=True,
            ).exists(),
        )

    def test_expiry_scan_does_not_duplicate(self):
        from notifications.services import notify_expiry

        self.product.track_expiry = True
        self.product.expiry_date = timezone.localdate() + timedelta(days=2)
        self.product.save(update_fields=['track_expiry', 'expiry_date'])
        notify_expiry(self.product, branch=self.branch)
        scan_expiry_alerts(force=True)
        scan_expiry_alerts(force=True)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.owner,
                kind=Notification.Kind.EXPIRY_SOON,
                payload__product_id=self.product.pk,
            ).count(),
            1,
        )
