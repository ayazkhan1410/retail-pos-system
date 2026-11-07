import os

from django.db import DatabaseError, connection
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            connection.ensure_connection()
        except DatabaseError:
            return Response(
                {"status": "error", "message": "Database is unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        response = Response({"status": "ok", "message": "SmartShop POS is running"})
        if boot_id := os.getenv('TIJORI_BOOT_ID'):
            response['X-Tijori-Boot'] = boot_id
        return response
