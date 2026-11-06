from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditLog
from audit.services import log_event
from auth.permissions import requires


class ClientEventSerializer(serializers.Serializer):
    # Only actions the server cannot see for itself; everything else is logged server-side.
    action = serializers.ChoiceField(choices=['cart_cleared'])
    target = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    details = serializers.DictField(required=False, default=dict)


class ClientEventView(APIView):
    def post(self, request):
        serializer = ClientEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        log_event(request.user, **serializer.validated_data)
        return Response(status=status.HTTP_201_CREATED)


class ActivityPagination(PageNumberPagination):
    page_size = 8
    page_size_query_param = 'page_size'
    max_page_size = 40


class ActivityListView(APIView):
    """Paginated shop activity for the dashboard feed (newest first)."""

    permission_classes = [requires(read='dashboard.view')]

    def get(self, request):
        queryset = AuditLog.objects.select_related('user').order_by('-id')
        paginator = ActivityPagination()
        page = paginator.paginate_queryset(queryset, request)
        results = [
            {
                'id': entry.id,
                'action': entry.action,
                'target': entry.target,
                'user': str(entry.user) if entry.user else '',
                'created_at': entry.created_at,
                'details': entry.details or {},
            }
            for entry in page
        ]
        return paginator.get_paginated_response(results)
