import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('customers', '0001_initial'),
        ('sales', '0004_returnline_product_returnline_unit_price_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='HeldBill',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(blank=True, max_length=80)),
                ('discount', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('lines', models.JSONField(default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('customer', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='customers.customer',
                )),
                ('held_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT, related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('terminal', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name='held_bills',
                    to='sales.terminal',
                )),
            ],
            options={
                'ordering': ['-id'],
            },
        ),
        migrations.AddIndex(
            model_name='heldbill',
            index=models.Index(fields=['terminal', '-id'], name='sales_heldb_termina_7a0c1d_idx'),
        ),
    ]
