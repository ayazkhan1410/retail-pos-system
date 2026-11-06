from rest_framework import serializers

from notifications.models import Notification
from notifications.services import serialize_notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            'id',
            'kind',
            'severity',
            'title',
            'body',
            'payload',
            'read_at',
            'created_at',
        )
        read_only_fields = fields

    def to_representation(self, instance):
        return serialize_notification(instance)


class MarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        max_length=100,
    )
