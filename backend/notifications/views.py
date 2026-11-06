from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification
from notifications.serializers import MarkReadSerializer, NotificationSerializer


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = min(max(1, int(request.query_params.get('page_size', 20))), 50)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'page and page_size must be valid integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        unread_only = request.query_params.get('unread') in ('1', 'true', 'True')
        qs = Notification.objects.filter(recipient=request.user)
        if unread_only:
            qs = qs.filter(read_at__isnull=True)

        total = qs.count()
        start = (page - 1) * page_size
        rows = qs.order_by('-id')[start:start + page_size]
        unread_count = Notification.objects.filter(
            recipient=request.user,
            read_at__isnull=True,
        ).count()

        return Response(
            {
                'count': total,
                'page': page,
                'page_size': page_size,
                'unread_count': unread_count,
                'results': NotificationSerializer(rows, many=True).data,
            },
        )


class NotificationUnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            recipient=request.user,
            read_at__isnull=True,
        ).count()
        return Response({'unread_count': count})


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data['ids']
        updated = (
            Notification.objects.filter(
                recipient=request.user,
                id__in=ids,
                read_at__isnull=True,
            ).update(read_at=timezone.now())
        )
        return Response({'updated': updated})


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = (
            Notification.objects.filter(
                recipient=request.user,
                read_at__isnull=True,
            ).update(read_at=timezone.now())
        )
        return Response({'updated': updated})
