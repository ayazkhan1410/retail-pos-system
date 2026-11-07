from decimal import Decimal

from django.db.models import Count, ProtectedError, Q, Sum
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import log_event
from auth.permissions import requires
from suppliers.models import Supplier, SupplierLedgerEntry
from suppliers.serializers import (
    BulkDeleteSupplierSerializer,
    CreateSupplierSerializer,
    SupplierDetailSerializer,
    SupplierLedgerSerializer,
    SupplierListSerializer,
    SupplierPaymentInput,
    UpdateSupplierSerializer,
)
from suppliers.services import due_dates, post_supplier_entry, with_standing


class ListCreateSupplierDataView(APIView):
    permission_classes = [requires('suppliers.view', 'suppliers.edit')]

    SORTABLE_FIELDS = {
        "id",
        "name",
        "city",
        "credit_balance",
        "created_at",
        "updated_at",
    }

    def get(self, request):
        queryset = Supplier.objects.all()

        # ----------------------------
        # Search
        # ----------------------------
        search = request.query_params.get("search")

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(city__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
                | Q(ntn__icontains=search)
            )

        # ----------------------------
        # Filters
        # ----------------------------
        status_filter = request.query_params.get("status")
        payment_type = request.query_params.get("payment_type")
        city = request.query_params.get("city")

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if payment_type:
            queryset = queryset.filter(payment_type=payment_type)

        if city:
            queryset = queryset.filter(city__iexact=city)

        balance = request.query_params.get("balance")
        if balance == "owed":
            queryset = queryset.filter(credit_balance__gt=0)
        elif balance == "settled":
            queryset = queryset.filter(credit_balance__lte=0)

        # ----------------------------
        # Sorting
        # ----------------------------
        ordering = request.query_params.get(
            "ordering",
            "-created_at",
        )

        ordering_field = ordering.removeprefix("-")

        if ordering_field in self.SORTABLE_FIELDS:
            queryset = queryset.order_by(ordering)
        else:
            queryset = queryset.order_by("-created_at")

        # ----------------------------
        # Pagination
        # ----------------------------
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 20))
        except (TypeError, ValueError):
            return Response(
                {"detail": "page and page_size must be valid integers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page < 1:
            return Response(
                {"page": ["Page must be greater than or equal to 1."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page_size = min(max(page_size, 1), 100)

        total_count = queryset.count()
        owed = Supplier.objects.filter(credit_balance__gt=0).aggregate(
            total=Coalesce(Sum("credit_balance"), Decimal(0)), suppliers=Count("id"),
        )

        start = (page - 1) * page_size
        end = start + page_size

        rows = list(with_standing(queryset)[start:end])

        serializer = SupplierListSerializer(
            rows,
            many=True,
            context={"due_dates": due_dates(rows)},
        )

        return Response(
            {
                "count": total_count,
                "page": page,
                "page_size": page_size,
                "results": serializer.data,
                "total_owed": owed["total"],
                "suppliers_owed": owed["suppliers"],
                "cities": list(
                    Supplier.objects.exclude(city__isnull=True).exclude(city="")
                    .values_list("city", flat=True).distinct().order_by("city")[:200]
                ),
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = CreateSupplierSerializer(
            data=request.data,
            context={"request": request},
        )

        serializer.is_valid(raise_exception=True)
        supplier = serializer.save()

        return Response(
            SupplierDetailSerializer(supplier).data,
            status=status.HTTP_201_CREATED,
        )


class RetrieveUpdateDeleteSupplierDataView(APIView):
    permission_classes = [requires('suppliers.view', 'suppliers.edit')]

    def get_object(self, supplier_id):
        try:
            return Supplier.objects.get(id=supplier_id)
        except Supplier.DoesNotExist:
            return None

    def get(self, request, supplier_id):
        supplier = self.get_object(supplier_id)

        if not supplier:
            return Response(
                {"detail": "Supplier not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = SupplierDetailSerializer(
            supplier,
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )

    def put(self, request, supplier_id):
        supplier = self.get_object(supplier_id)

        if not supplier:
            return Response(
                {"detail": "Supplier not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = UpdateSupplierSerializer(
            supplier,
            data=request.data,
            partial=True,
        )

        serializer.is_valid(raise_exception=True)
        supplier = serializer.save()

        return Response(
            SupplierDetailSerializer(supplier).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request, supplier_id):
        supplier = self.get_object(supplier_id)

        if not supplier:
            return Response(
                {"detail": "Supplier not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = UpdateSupplierSerializer(
            supplier,
            data=request.data,
            partial=True,
        )

        serializer.is_valid(raise_exception=True)
        supplier = serializer.save()

        return Response(
            SupplierDetailSerializer(supplier).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request, supplier_id):
        supplier = self.get_object(supplier_id)

        if not supplier:
            return Response(
                {"detail": "Supplier not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            supplier.delete()
        except ProtectedError:
            return Response(
                {"detail": "This supplier has products linked to it. Mark it inactive instead."},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class BulkDeleteSupplierDataView(APIView):
    permission_classes = [requires('suppliers.view', 'suppliers.edit')]

    def post(self, request):
        serializer = BulkDeleteSupplierSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        supplier_ids = serializer.validated_data["ids"]

        try:
            deleted_count, _ = (
                Supplier.objects
                .filter(id__in=supplier_ids)
                .delete()
            )
        except ProtectedError:
            return Response(
                {"detail": "Some suppliers have products linked to them. Mark them inactive instead."},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                "message": f"{deleted_count} supplier(s) deleted successfully."
            },
            status=status.HTTP_200_OK,
        )


class SupplierLedgerView(APIView):
    permission_classes = [requires("suppliers.view", "suppliers.pay")]

    def get(self, request, supplier_id):
        entries = SupplierLedgerEntry.objects.filter(supplier_id=supplier_id).select_related("user")[:200]
        return Response(SupplierLedgerSerializer(entries, many=True).data)

    def post(self, request, supplier_id):
        """Records money paid to the supplier."""
        data = SupplierPaymentInput(data=request.data)
        data.is_valid(raise_exception=True)
        supplier = Supplier.objects.filter(pk=supplier_id).first()
        if not supplier:
            return Response({"detail": "Supplier not found."}, status=status.HTTP_404_NOT_FOUND)
        values = data.validated_data
        post_supplier_entry(
            supplier.pk, -values["amount"], SupplierLedgerEntry.Kind.PAYMENT, request.user,
            method=values["method"], reference=values["reference"],
        )
        log_event(request.user, "supplier_paid", supplier.name, {"amount": str(values["amount"]), "method": values["method"]})
        supplier.refresh_from_db()
        return Response(SupplierDetailSerializer(supplier).data, status=status.HTTP_201_CREATED)
