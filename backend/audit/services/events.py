def log_event(user, action, target='', details=None):
    from audit.models import AuditLog

    AuditLog.objects.create(user=user, action=action, target=target, details=details or {})
