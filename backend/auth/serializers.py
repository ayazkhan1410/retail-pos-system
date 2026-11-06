from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from auth.models import CustomUser


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    pin = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=6)
    has_pin = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    full_name = serializers.CharField(max_length=150)

    class Meta:
        model = CustomUser
        fields = (
            'id', 'email', 'full_name', 'phone', 'employee_code', 'role', 'is_active',
            'permissions', 'password', 'pin', 'has_pin',
        )

    def get_permissions(self, user):
        return sorted(user.permission_codes)

    def get_has_pin(self, user):
        return bool(user.pin)

    def validate_role(self, value):
        # Staff managers can't hand out the one role that can do everything.
        request = self.context.get('request')
        if value == 'owner' and request and not request.user.is_owner:
            raise serializers.ValidationError('Only an owner can create or promote an owner.')
        return value

    def validate_employee_code(self, value):
        return value or None

    def validate_password(self, value):
        validate_password(value, self.instance)
        return value

    def validate(self, attrs):
        if not self.instance and not attrs.get('password'):
            raise serializers.ValidationError({'password': 'Password is required.'})
        return attrs

    def validate_pin(self, value):
        if value in (None, ''):
            return ''
        if not value.isdigit() or not (4 <= len(value) <= 6):
            raise serializers.ValidationError('PIN must be 4-6 digits.')
        # Reject reuse so PIN switch cannot hit the wrong account.
        from django.contrib.auth.hashers import check_password

        others = CustomUser.objects.exclude(pin='').only('id', 'pin')
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        for other in others.iterator(chunk_size=100):
            if check_password(value, other.pin):
                raise serializers.ValidationError('That PIN is already used by another staff member.')
        return value

    def create(self, validated_data):
        pin = validated_data.pop('pin', '')
        user = CustomUser.objects.create_user(**validated_data)
        if pin:
            user.pin = make_password(pin)
            user.save(update_fields=['pin'])
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        pin = validated_data.pop('pin', None)
        if password:
            instance.set_password(password)
        user = super().update(instance, validated_data)
        if pin is not None:
            user.pin = make_password(pin) if pin else ''
            user.save(update_fields=['pin'])
        return user
