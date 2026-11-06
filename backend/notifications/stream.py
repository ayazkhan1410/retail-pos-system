import json
import logging
import threading
import time
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db import close_old_connections
from django.db.models import Q
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from django.views import View

from notifications.models import Notification
from notifications.services import scan_expiry_alerts, serialize_notification

logger = logging.getLogger(__name__)

POLL_SECONDS = 2
HEARTBEAT_SECONDS = 15
# Short-lived streams: clients reconnect; sync gunicorn workers are freed quickly.
MAX_STREAM_SECONDS = 45
# Hard cap per process. Prod uses 3 gthread workers × 4 threads = 12 slots.
# DEBUG is higher because React Strict Mode + Vite HMR briefly overlap streams.
MAX_CONCURRENT_STREAMS = 12 if settings.DEBUG else 6
_STREAM_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_STREAMS)


class NotificationStreamView(LoginRequiredMixin, View):
    """
    Session-authenticated SSE feed.

    Plain Django view (not DRF) so Accept: text/event-stream does not 406.
    """

    raise_exception = True

    def get(self, request):
        if not request.user.is_authenticated:
            return HttpResponse(status=401)

        last_id = 0
        raw = request.headers.get('Last-Event-ID') or request.GET.get('last_id')
        if raw:
            try:
                last_id = max(0, int(raw))
            except (TypeError, ValueError):
                last_id = 0

        if not _STREAM_SLOTS.acquire(blocking=False):
            return HttpResponse(
                'event: error\ndata: {"detail":"too_many_streams"}\n\n',
                status=503,
                content_type='text/event-stream',
            )

        user_id = request.user.pk

        def guarded():
            try:
                yield from self._stream(user_id, last_id)
            finally:
                _STREAM_SLOTS.release()
                close_old_connections()

        response = StreamingHttpResponse(guarded(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache, no-transform'
        response['X-Accel-Buffering'] = 'no'
        return response

    def _stream(self, user_id: int, last_id: int):
        started = time.monotonic()
        last_heartbeat = started
        # Catch updates to existing alerts (qty changes), not only new ids.
        watermark = timezone.now() - timedelta(seconds=1)
        sent_versions: set[tuple[int, str]] = set()

        # Opportunistic expiry scan (throttled globally) without a stock change.
        try:
            scan_expiry_alerts(force=False)
        except Exception:
            logger.exception('Expiry scan on stream connect failed')

        yield (
            f'event: connected\n'
            f'data: {json.dumps({"ok": True, "server_time": timezone.now().isoformat(), "max_seconds": MAX_STREAM_SECONDS})}\n\n'
        )

        while True:
            now = time.monotonic()
            if now - started >= MAX_STREAM_SECONDS:
                yield f'event: reconnect\ndata: {json.dumps({"last_id": last_id})}\n\n'
                break

            close_old_connections()
            try:
                poll_started = timezone.now()
                rows = list(
                    Notification.objects.filter(recipient_id=user_id)
                    .filter(Q(id__gt=last_id) | Q(updated_at__gte=watermark))
                    .order_by('updated_at', 'id')[:50]
                )
                for notification in rows:
                    version = (notification.id, notification.updated_at.isoformat())
                    if version in sent_versions:
                        continue
                    sent_versions.add(version)
                    last_id = max(last_id, notification.id)
                    payload = serialize_notification(notification)
                    yield (
                        f'id: {notification.id}\n'
                        f'event: notification\n'
                        f'data: {json.dumps(payload)}\n\n'
                    )
                watermark = poll_started
                # Bound memory of version set.
                if len(sent_versions) > 500:
                    sent_versions = set(list(sent_versions)[-200:])
            except Exception:
                logger.exception('SSE poll failed for user_id=%s', user_id)
                yield f'event: error\ndata: {json.dumps({"detail": "poll_failed"})}\n\n'

            if time.monotonic() - last_heartbeat >= HEARTBEAT_SECONDS:
                last_heartbeat = time.monotonic()
                yield f'event: ping\ndata: {json.dumps({"ts": timezone.now().isoformat()})}\n\n'

            time.sleep(POLL_SECONDS)
