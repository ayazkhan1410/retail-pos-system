from django.db import migrations


def create_terminals(apps, schema_editor):
    branch = apps.get_model('inventory', 'Branch').objects.order_by('id').first()
    Terminal = apps.get_model('sales', 'Terminal')
    for code, name in (('C1', 'Counter 1'), ('C2', 'Counter 2')):
        Terminal.objects.get_or_create(branch=branch, code=code, defaults={'name': name})


class Migration(migrations.Migration):
    dependencies = [('sales', '0001_initial'), ('inventory', '0002_starter_data')]
    operations = [migrations.RunPython(create_terminals, migrations.RunPython.noop)]
