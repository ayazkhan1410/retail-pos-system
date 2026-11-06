from django.core.management.base import BaseCommand, CommandError

from inventory.services import es_enabled, reindex_all


class Command(BaseCommand):
    help = 'Rebuild the Elasticsearch product index from the database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--recreate',
            action='store_true',
            help='Delete and recreate the index before loading documents.',
        )

    def handle(self, *args, **options):
        if not es_enabled():
            raise CommandError('Set ELASTICSEARCH_URL before reindexing.')
        count = reindex_all(recreate=options['recreate'])
        self.stdout.write(self.style.SUCCESS(f'Indexed {count} products.'))
