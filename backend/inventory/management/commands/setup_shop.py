import getpass
import json
import os
import sys

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from auth.models import CustomUser, UserRole
from inventory.models import Branch
from inventory.serializers import BranchSerializer
from sales.models import Shift, Terminal

MAX_PASSWORD_LENGTH = 1024


def owner_accounts():
    return CustomUser.objects.filter(Q(role=UserRole.OWNER) | Q(is_superuser=True))


def read_password():
    value = os.environ.get('TIJORI_OWNER_PASSWORD')
    if value is None:
        if sys.stdin.isatty():
            value = getpass.getpass('Owner password: ')
        else:
            # Electron writes UTF-8 to its child pipe even on Windows.
            # UTF-8 uses up to four bytes per character. Include room for a Windows line ending.
            line = getattr(sys.stdin, 'buffer', sys.stdin).readline(4 * MAX_PASSWORD_LENGTH + 2)
            try:
                value = line.decode('utf-8') if isinstance(line, bytes) else line
            except UnicodeDecodeError as exc:
                raise CommandError('The password pipe must be UTF-8.') from exc
            value = value.rstrip('\r\n')
    if not value or '\n' in value or '\r' in value:
        raise CommandError('Provide a single-line owner password through stdin or TIJORI_OWNER_PASSWORD.')
    if len(value) > MAX_PASSWORD_LENGTH:
        raise CommandError(f'Owner password must be at most {MAX_PASSWORD_LENGTH} characters.')
    return value


def setup_status():
    branch = Branch.objects.filter(code='01').first()
    owner_email = owner_accounts().order_by('pk').values_list('email', flat=True).first()
    return {
        'ok': True,
        'configured': owner_email is not None,
        'branch': branch.code if branch else None,
        'store': branch.store_name if branch else None,
        'owner_email': owner_email,
        'counters': Terminal.objects.filter(branch=branch, active=True).count() if branch else 0,
    }


class Command(BaseCommand):
    help = 'Configure a Tijori shop on a migrated database. Read the owner password from stdin or the environment.'

    def add_arguments(self, parser):
        parser.add_argument('--status', action='store_true', help='Print setup status without writing or reading a password.')
        parser.add_argument('--store', '--store-name', help='Trading name for receipts.')
        parser.add_argument('--branch', help='Branch name.')
        parser.add_argument('--phone', default='')
        parser.add_argument('--address', default='')
        parser.add_argument('--ntn', default='')
        parser.add_argument('--footer', '--receipt-footer', default='')
        parser.add_argument('--owner-name')
        parser.add_argument('--owner-email')
        parser.add_argument('--counters', type=int, default=1)
        parser.add_argument('--force', action='store_true', help='Explicitly reconfigure a shop with an existing owner.')

    def handle(self, *args, **options):
        try:
            result = setup_status() if options['status'] else self.configure(options)
        except (CommandError, ValidationError) as exc:
            message = ' '.join(exc.messages) if isinstance(exc, ValidationError) else str(exc)
            self.stdout.write(json.dumps({'ok': False, 'error': message}))
            raise CommandError(message) from exc
        self.stdout.write(json.dumps(result))

    @transaction.atomic
    def configure(self, options):
        for key in ('store', 'branch', 'owner_name', 'owner_email'):
            if not (options[key] or '').strip():
                raise CommandError(f'--{key.replace("_", "-")} is required.')
        count = options['counters']
        if type(count) is not int or not 1 <= count <= 20:
            raise CommandError('Counters must be between 1 and 20.')
        if len(options['address'].strip()) > 2000:
            raise CommandError('Address must be at most 2000 characters.')

        # The seeded branch is the synchronization point for simultaneous first-run attempts.
        branch, _ = Branch.objects.select_for_update().get_or_create(code='01', defaults={'name': 'Main Branch'})
        if owner_accounts().exists() and not options['force']:
            raise CommandError('An owner already exists. Explicit --force is required to reconfigure.')
        fields = {
            'name': options['branch'], 'store_name': options['store'], 'phone': options['phone'],
            'address': options['address'], 'ntn': options['ntn'], 'receipt_footer': options['footer'],
        }
        details = BranchSerializer(branch, data=fields)
        if not details.is_valid():
            errors = [f'{key}: {" ".join(map(str, messages))}' for key, messages in details.errors.items()]
            raise CommandError(' '.join(errors))

        email = CustomUser.objects.normalize_email(options['owner_email'].strip())
        owner = CustomUser.objects.filter(email__iexact=email).first()
        if owner and not owner.is_owner:
            raise CommandError('This email is already used by a non-owner account.')
        if not owner:
            owner = CustomUser(email=email)
        owner.role = UserRole.OWNER
        owner.full_name = options['owner_name'].strip()
        owner.is_active = True
        owner.full_clean(exclude=['password'])
        password = read_password()
        validate_password(password, user=owner)

        details.save()
        codes = [f'C{n}' for n in range(1, count + 1)]
        surplus = Terminal.objects.filter(branch=branch, active=True).exclude(code__in=codes)
        if Shift.objects.filter(terminal__in=surplus, closed_at__isnull=True).exists():
            raise CommandError('Close open shifts before reducing the number of counters.')
        surplus.update(active=False)
        for number, code in enumerate(codes, start=1):
            Terminal.objects.update_or_create(branch=branch, code=code, defaults={'name': f'Counter {number}', 'active': True})

        owner.set_password(password)
        owner.save()
        return {'ok': True, 'branch': branch.code, 'owner_email': owner.email, 'counters': count}
