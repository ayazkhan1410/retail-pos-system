from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import log_event


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
