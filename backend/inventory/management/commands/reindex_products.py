from django.core.management.base import BaseCommand, CommandError

from inventory.search import es_enabled, reindex_all


class Command(BaseCommand):
    help = 'Rebuild the Elasticsearch product index from the database.'

    def handle(self, *args, **options):
        if not es_enabled():
            raise CommandError('Set ELASTICSEARCH_URL before reindexing.')
        count = reindex_all()
        self.stdout.write(self.style.SUCCESS(f'Indexed {count} products.'))
