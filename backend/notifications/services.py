import logging
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from notifications.models import Notification

logger = logging.getLogger(__name__)
User = get_user_model()

INVENTORY_ALERT_PERMISSIONS = ('products.edit', 'stock.adjust', 'purchases.edit')
EXPIRY_SOON_DAYS = 7
EXPIRY_SCAN_CACHE_KEY = 'notifications:expiry_scan:last'
EXPIRY_SCAN_INTERVAL_SECONDS = 60 * 30


def serialize_notification(notification: Notification) -> dict:
    return {
        'id': notification.id,
        'kind': notification.kind,
        'severity': notification.severity,
        'title': notification.title,
        'body': notification.body,
        'payload': notification.payload or {},
        'read_at': notification.read_at.isoformat() if notification.read_at else None,
        'created_at': notification.created_at.isoformat(),
        'updated_at': notification.updated_at.isoformat(),
    }


def stock_dedupe_key(product_id, branch_id) -> str:
    return f'stock:product:{product_id}:branch:{branch_id}'


def expiry_dedupe_key(product_id, branch_id=0) -> str:
    return f'expiry:product:{product_id}:branch:{branch_id}'


def _recipients_for_permissions(permission_codes: tuple[str, ...]):
    users = []
    for user in User.objects.filter(is_active=True).only(
        'id', 'role', 'is_superuser', 'is_active',
    ):
        if getattr(user, 'is_owner', False) or user.is_superuser:
            users.append(user)
            continue
        if any(code in user.permission_codes for code in permission_codes):
            users.append(user)
    return users


def notify_users(
    *,
    users,
    kind: str,
    title: str,
    body: str = '',
    severity: str = Notification.Severity.INFO,
    payload: dict | None = None,
    dedupe_key: str = '',
) -> list[Notification]:
    """Create or refresh unread notifications. Never raises to callers."""
    created: list[Notification] = []
    payload = payload or {}
    try:
        with transaction.atomic():
            for user in users:
                if dedupe_key:
                    existing = (
                        Notification.objects.select_for_update()
                        .filter(
                            recipient=user,
                            dedupe_key=dedupe_key,
                            read_at__isnull=True,
                        )
                        .first()
                    )
                    if existing:
                        existing.kind = kind
                        existing.severity = severity
                        existing.title = title
                        existing.body = body
                        existing.payload = payload
                        existing.save(
                            update_fields=[
                                'kind',
                                'severity',
                                'title',
                                'body',
                                'payload',
                                'updated_at',
                            ],
                        )
                        created.append(existing)
                        continue

                created.append(
                    Notification.objects.create(
                        recipient=user,
                        kind=kind,
                        severity=severity,
                        title=title,
                        body=body,
                        payload=payload,
                        dedupe_key=dedupe_key,
                    ),
                )
    except Exception:
        logger.exception('Failed to create notifications kind=%s', kind)
        return []
    return created


def notify_permission_holders(
    *,
    permissions: tuple[str, ...],
    kind: str,
    title: str,
    body: str = '',
    severity: str = Notification.Severity.INFO,
    payload: dict | None = None,
    dedupe_key: str = '',
) -> list[Notification]:
    return notify_users(
        users=_recipients_for_permissions(permissions),
        kind=kind,
        title=title,
        body=body,
        severity=severity,
        payload=payload,
        dedupe_key=dedupe_key,
    )


def resolve_alerts(dedupe_keys: list[str]) -> int:
    """Mark matching unread alerts as read (e.g. after restock)."""
    if not dedupe_keys:
        return 0
    try:
        return Notification.objects.filter(
            dedupe_key__in=dedupe_keys,
            read_at__isnull=True,
        ).update(read_at=timezone.now())
    except Exception:
        logger.exception('Failed to resolve alerts keys=%s', dedupe_keys)
        return 0


def notify_stock_level(product, branch, quantity) -> None:
    """Raise or clear stock alerts after inventory changes."""
    try:
        threshold = product.threshold if product.threshold is not None else Decimal(0)
        qty = Decimal(quantity)
        key = stock_dedupe_key(product.pk, branch.pk)
        branch_name = str(branch)
        payload = {
            'product_id': product.pk,
            'product_name': product.name,
            'barcode': product.barcode,
            'branch_id': branch.pk,
            'branch_name': branch_name,
            'quantity': str(qty),
            'threshold': str(threshold),
            'i18n_key': '',
            'i18n_params': {},
        }

        if qty > threshold:
            resolve_alerts([key])
            return

        if qty <= 0:
            payload['i18n_key'] = 'notifications.alerts.outOfStock'
            payload['i18n_params'] = {
                'name': product.name,
                'branch': branch_name,
                'qty': str(qty),
            }
            notify_permission_holders(
                permissions=INVENTORY_ALERT_PERMISSIONS,
                kind=Notification.Kind.OUT_OF_STOCK,
                severity=Notification.Severity.CRITICAL,
                title=f'Out of stock: {product.name}',
                body=f'{product.name} has no stock left at {branch_name}.',
                payload=payload,
                dedupe_key=key,
            )
            return

        payload['i18n_key'] = 'notifications.alerts.lowStock'
        payload['i18n_params'] = {
            'name': product.name,
            'branch': branch_name,
            'qty': str(qty),
            'threshold': str(threshold),
        }
        notify_permission_holders(
            permissions=INVENTORY_ALERT_PERMISSIONS,
            kind=Notification.Kind.LOW_STOCK,
            severity=Notification.Severity.WARNING,
            title=f'Low stock: {product.name}',
            body=f'{product.name} is at {qty} (threshold {threshold}) at {branch_name}.',
            payload=payload,
            dedupe_key=key,
        )
    except Exception:
        logger.exception('Stock alert failed for product=%s', getattr(product, 'pk', None))


def notify_expiry(product, branch=None) -> None:
    """Alert when a product is expired or nearing expiry."""
    try:
        if not getattr(product, 'track_expiry', False):
            return
        expiry = product.expiry_date
        if not expiry:
            return
        today = timezone.localdate()
        branch_id = getattr(branch, 'pk', None) or 0
        branch_name = str(branch) if branch is not None else ''
        key = expiry_dedupe_key(product.pk, branch_id)
        payload = {
            'product_id': product.pk,
            'product_name': product.name,
            'barcode': product.barcode,
            'expiry_date': expiry.isoformat(),
            'branch_id': branch_id,
            'branch_name': branch_name,
            'i18n_key': '',
            'i18n_params': {},
        }

        if expiry < today:
            payload['i18n_key'] = 'notifications.alerts.expired'
            payload['i18n_params'] = {
                'name': product.name,
                'date': expiry.isoformat(),
            }
            notify_permission_holders(
                permissions=INVENTORY_ALERT_PERMISSIONS,
                kind=Notification.Kind.EXPIRED,
                severity=Notification.Severity.CRITICAL,
                title=f'Expired: {product.name}',
                body=f'{product.name} expired on {expiry.isoformat()}.',
                payload=payload,
                dedupe_key=key,
            )
            return

        if expiry <= today + timedelta(days=EXPIRY_SOON_DAYS):
            payload['i18n_key'] = 'notifications.alerts.expirySoon'
            payload['i18n_params'] = {
                'name': product.name,
                'date': expiry.isoformat(),
            }
            notify_permission_holders(
                permissions=INVENTORY_ALERT_PERMISSIONS,
                kind=Notification.Kind.EXPIRY_SOON,
                severity=Notification.Severity.WARNING,
                title=f'Expiring soon: {product.name}',
                body=f'{product.name} expires on {expiry.isoformat()}.',
                payload=payload,
                dedupe_key=key,
            )
            return

        # Healthy again — clear leftover expiry alerts.
        resolve_alerts([key])
    except Exception:
        logger.exception('Expiry alert failed for product=%s', getattr(product, 'pk', None))


def scan_expiry_alerts(*, force: bool = False) -> int:
    """
    Scan products for expiry alerts without requiring a stock movement.
    Throttled so open SSE screens do not hammer the DB.
    """
    if not force and cache.get(EXPIRY_SCAN_CACHE_KEY):
        return 0
    cache.set(EXPIRY_SCAN_CACHE_KEY, True, EXPIRY_SCAN_INTERVAL_SECONDS)

    from inventory.models import Product

    today = timezone.localdate()
    soon = today + timedelta(days=EXPIRY_SOON_DAYS)
    count = 0
    qs = Product.objects.filter(
        active=True,
        track_expiry=True,
        expiry_date__isnull=False,
        expiry_date__lte=soon,
    ).only('id', 'name', 'barcode', 'expiry_date', 'track_expiry', 'active')
    for product in qs.iterator(chunk_size=200):
        before = Notification.objects.filter(
            dedupe_key=expiry_dedupe_key(product.pk, 0),
            read_at__isnull=True,
        ).count()
        notify_expiry(product, branch=None)
        after = Notification.objects.filter(
            dedupe_key=expiry_dedupe_key(product.pk, 0),
            read_at__isnull=True,
        ).count()
        if after >= before and after:
            count += 1
    return count
