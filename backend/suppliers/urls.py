from django.urls import path

from suppliers.views import (
    BulkDeleteSupplierDataView,
    ListCreateSupplierDataView,
    RetrieveUpdateDeleteSupplierDataView,
    SupplierLedgerView,
)

urlpatterns = [
    path(
        "",
        ListCreateSupplierDataView.as_view(),
        name="list-create-supplier",
    ),
    path(
        "bulk-delete/",
        BulkDeleteSupplierDataView.as_view(),
        name="bulk-delete-supplier",
    ),
    path("<int:supplier_id>/ledger/", SupplierLedgerView.as_view()),
    path(
        "<int:supplier_id>/",
        RetrieveUpdateDeleteSupplierDataView.as_view(),
        name="retrieve-update-delete-supplier",
    ),
]
