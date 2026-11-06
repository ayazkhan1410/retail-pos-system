from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from auth.models import CustomUser


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    permissions = serializers.SerializerMethodField()
    full_name = serializers.CharField(max_length=150)

    class Meta:
        model = CustomUser
        fields = ('id', 'email', 'full_name', 'phone', 'employee_code', 'role', 'is_active', 'permissions', 'password')

    def get_permissions(self, user):
        return sorted(user.permission_codes)

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

    def create(self, validated_data):
        return CustomUser.objects.create_user(**validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)
        return super().update(instance, validated_data)
