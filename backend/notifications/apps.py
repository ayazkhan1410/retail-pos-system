from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'notifications'

    def ready(self):
        # Import side-effect hooks only when the registry is ready.
        from notifications import signals  # noqa: F401
