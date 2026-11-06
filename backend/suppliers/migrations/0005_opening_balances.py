from django.db import migrations


def opening_entries(apps, schema_editor):
    Supplier = apps.get_model('suppliers', 'Supplier')
    Entry = apps.get_model('suppliers', 'SupplierLedgerEntry')
    for supplier in Supplier.objects.exclude(credit_balance=0):
        Entry.objects.create(supplier=supplier, delta=supplier.credit_balance, kind='opening', reference='Balance before ledger')


class Migration(migrations.Migration):
    dependencies = [('suppliers', '0004_alter_supplier_credit_balance_supplierledgerentry')]
    operations = [migrations.RunPython(opening_entries, migrations.RunPython.noop)]
