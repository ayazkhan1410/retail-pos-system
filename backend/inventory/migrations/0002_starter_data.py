from django.db import migrations

CATEGORIES = [
    'BATH ITEMS', 'BEVERAGE', 'BIRTHDAY', 'CAT FOOD', 'COSMETICS', 'CROCKERY',
    'DAIRY', 'GROCERY', 'BAKERY', 'SNACKS', 'CLEANING', 'STATIONERY',
]


def create_starter_data(apps, schema_editor):
    apps.get_model('inventory', 'Branch').objects.get_or_create(code='01', defaults={'name': 'Main Branch'})
    Category = apps.get_model('inventory', 'Category')
    for name in CATEGORIES:
        Category.objects.get_or_create(name=name)


class Migration(migrations.Migration):
    dependencies = [('inventory', '0001_initial')]
    operations = [migrations.RunPython(create_starter_data, migrations.RunPython.noop)]
