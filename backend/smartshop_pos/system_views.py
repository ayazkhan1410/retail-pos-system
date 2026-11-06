import os

from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from auth.permissions import requires
from smartshop_pos.services.backup import BackupError, create_database_backup


class AppVersionView(APIView):
    def get(self, request):
        return Response({'version': os.getenv('APP_VERSION', '0.1.0')})


class DatabaseBackupView(APIView):
    permission_classes = [requires(write='backup.run')]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'backup'

    def post(self, request):
        try:
            backup = create_database_backup()
        except BackupError as exc:
            return Response({'status': 'error', 'message': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'status': 'ok',
            'message': 'Database backup completed successfully.',
            **backup,
        }, status=status.HTTP_201_CREATED)
