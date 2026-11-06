from django.core.management.base import BaseCommand

from notifications.services import scan_expiry_alerts


class Command(BaseCommand):
    help = 'Create expiry/near-expiry notifications without requiring a stock change.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Ignore the throttle cache and scan immediately.',
        )

    def handle(self, *args, **options):
        count = scan_expiry_alerts(force=options['force'])
        self.stdout.write(self.style.SUCCESS(f'Expiry alert scan complete (touched≈{count}).'))
