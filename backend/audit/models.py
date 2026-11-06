from django.conf import settings
from django.db import models


class AppendOnlyModel(models.Model):
    """History rows can be added but never edited or deleted through the app."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError(f'{type(self).__name__} records cannot be changed.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError(f'{type(self).__name__} records cannot be deleted.')


class AuditLog(AppendOnlyModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT)
    action = models.CharField(max_length=50, db_index=True)
    target = models.CharField(max_length=255, blank=True)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-id']


def log_event(user, action, target='', details=None):
    AuditLog.objects.create(user=user, action=action, target=target, details=details or {})
