import os

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from smartshop_pos.services.backup import BackupError, create_database_backup


def parse_version(version: str) -> tuple[int, ...]:
    parts: list[int] = []
    for piece in version.strip().split('.'):
        digits = ''.join(ch for ch in piece if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)


class AppVersionView(APIView):
    def get(self, request):
        return Response({
            'version': os.getenv('APP_VERSION', '0.1.0'),
        })


class CheckUpdatesView(APIView):
    def get(self, request):
        current = os.getenv('APP_VERSION', '0.1.0')
        latest = os.getenv('LATEST_APP_VERSION', current)
        update_available = parse_version(latest) > parse_version(current)

        return Response({
            'current_version': current,
            'latest_version': latest,
            'update_available': update_available,
            'release_notes': os.getenv(
                'UPDATE_RELEASE_NOTES',
                'Bug fixes and improvements.',
            ),
        })


class DatabaseBackupView(APIView):
    def post(self, request):
        try:
            backup = create_database_backup()
            return Response({
                'status': 'ok',
                'message': 'Database backup completed successfully.',
                **backup,
            }, status=status.HTTP_201_CREATED)
        except BackupError as exc:
            return Response({
                'status': 'error',
                'message': str(exc),
            }, status=status.HTTP_400_BAD_REQUEST)
