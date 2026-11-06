from django.db import migrations, models

from auth.catalog import DEFAULT_ROLE_PERMISSIONS


def seed(apps, schema_editor):
    RolePermission = apps.get_model('custom_auth', 'RolePermission')
    for role, codes in DEFAULT_ROLE_PERMISSIONS.items():
        RolePermission.objects.bulk_create([RolePermission(role=role, permission=code) for code in codes])


class Migration(migrations.Migration):
    dependencies = [('custom_auth', '0001_initial')]
    operations = [
        migrations.CreateModel(
            name='RolePermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('owner', 'Owner'), ('manager', 'Manager'), ('cashier', 'Cashier'), ('stock_keeper', 'Stock Keeper'), ('accountant', 'Accountant')], max_length=20)),
                ('permission', models.CharField(max_length=40)),
            ],
        ),
        migrations.AddConstraint(
            model_name='rolepermission',
            constraint=models.UniqueConstraint(fields=('role', 'permission'), name='unique_role_permission'),
        ),
        migrations.AlterField(
            model_name='customuser',
            name='role',
            field=models.CharField(blank=True, choices=[('owner', 'Owner'), ('manager', 'Manager'), ('cashier', 'Cashier'), ('stock_keeper', 'Stock Keeper'), ('accountant', 'Accountant')], default='cashier', max_length=20, null=True),
        ),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
