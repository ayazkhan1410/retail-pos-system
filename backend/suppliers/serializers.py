from rest_framework import serializers

from .models import Supplier


class SupplierListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = (
            "id",
            "name",
            "phone",
            "email",
            "address",
            "city",
            "ntn",
            "bank_account",
            "payment_type",
            "status",
            "credit_balance",
            "notes",
            "created_at",
        )


class SupplierDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"


class CreateSupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = (
            "name",
            "contact_person",
            "phone",
            "email",
            "address",
            "city",
            "ntn",
            "bank_account",
            "credit_balance",
            "payment_type",
            "status",
            "notes",
        )

        extra_kwargs = {
            "name": {
                "required": True,
                "allow_blank": False,
            },
            "contact_person": {
                "required": False,
                "allow_blank": True,
            },
            "phone": {
                "required": False,
                "allow_blank": True,
            },
            "email": {
                "required": False,
                "allow_blank": True,
            },
            "address": {
                "required": False,
                "allow_blank": True,
            },
            "city": {
                "required": False,
                "allow_blank": True,
            },
            "ntn": {
                "required": False,
                "allow_blank": True,
            },
            "bank_account": {
                "required": False,
                "allow_blank": True,
            },
            "credit_balance": {
                "required": False,
            },
            "payment_type": {
                "required": False,
            },
            "status": {
                "required": False,
            },
            "notes": {
                "required": False,
                "allow_blank": True,
            },
        }

    def validate_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Supplier name is required."
            )
        return value



class UpdateSupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = (
            "name",
            "contact_person",
            "phone",
            "email",
            "address",
            "city",
            "ntn",
            "bank_account",
            "credit_balance",
            "payment_type",
            "status",
            "notes",
        )
        extra_kwargs = {
            field: {"required": False}
            for field in fields
        }

    def validate_name(self, value):
        if value is not None and not value.strip():
            raise serializers.ValidationError(
                "Supplier name cannot be empty."
            )
        return value


class BulkDeleteSupplierSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=True,
        allow_empty=False,
    )
