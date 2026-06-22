from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView


class HealthCheckView(APIView):
    def get(self, request):
        try:
            return Response({
                "status": "ok",
                "message": "SmartShop POS is running"
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                "status": "error",
                "message": str(e),
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
