from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Kind(models.TextChoices):
        LOW_STOCK = 'low_stock', 'Low stock'
        OUT_OF_STOCK = 'out_of_stock', 'Out of stock'
        EXPIRY_SOON = 'expiry_soon', 'Expiring soon'
        EXPIRED = 'expired', 'Expired'
        SYSTEM = 'system', 'System'

    class Severity(models.TextChoices):
        INFO = 'info', 'Info'
        WARNING = 'warning', 'Warning'
        CRITICAL = 'critical', 'Critical'

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    kind = models.CharField(max_length=32, choices=Kind.choices, db_index=True)
    severity = models.CharField(
        max_length=16,
        choices=Severity.choices,
        default=Severity.INFO,
    )
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    # Same key + unread = update in place (no alert spam for the same product).
    dedupe_key = models.CharField(max_length=120, blank=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-id']
        indexes = [
            models.Index(fields=['recipient', 'read_at', '-id']),
            models.Index(fields=['recipient', 'dedupe_key', 'read_at']),
        ]

    def __str__(self):
        return f'{self.kind}: {self.title}'
