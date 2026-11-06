from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from inventory.models import Product, ProductBarcode
from inventory.search import delete_product, es_enabled, index_product


@receiver(post_save, sender=Product)
def product_indexed(sender, instance, **kwargs):
    if es_enabled():
        index_product(instance)


@receiver(post_delete, sender=Product)
def product_removed_from_index(sender, instance, **kwargs):
    if es_enabled():
        delete_product(instance.pk)


@receiver(post_save, sender=ProductBarcode)
@receiver(post_delete, sender=ProductBarcode)
def extra_barcode_changed(sender, instance, **kwargs):
    if not es_enabled():
        return
    product = getattr(instance, 'product', None)
    if product is not None:
        index_product(product)
