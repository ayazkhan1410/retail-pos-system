import io
import json
import os
import secrets
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from auth.models import CustomUser, RolePermission, UserRole
from inventory.models import Branch, Category
from sales.models import Shift, Terminal


class SetupShopTests(TestCase):
    def setUp(self):
        self.password = secrets.token_urlsafe(24)
        self.fields = {
            'store': 'Tijori Market', 'branch': 'Shop Branch', 'phone': '0300 0000000',
            'address': 'Shop 1', 'ntn': '1234567', 'footer': 'Thank you', 'owner_name': 'Shop Owner',
            'owner_email': 'shop@EXAMPLE.COM',
        }
        self.stdout = io.StringIO()

    def configure(self, *, password=None, **kwargs):
        env = {'TIJORI_OWNER_PASSWORD': self.password if password is None else password}
        with patch.dict(os.environ, env):
            call_command('setup_shop', **(self.fields | kwargs), stdout=self.stdout)

    def status(self):
        output = io.StringIO()
        call_command('setup_shop', status=True, stdout=output)
        return json.loads(output.getvalue())

    def test_setup_reuses_seeded_records_and_prints_json(self):
        branch = Branch.objects.get(code='01')
        old_counters = dict(Terminal.objects.filter(branch=branch).values_list('code', 'pk'))
        category_count = Category.objects.count()
        permission_count = RolePermission.objects.count()
        self.assertFalse(self.status()['configured'])
        self.configure(counters=3)
        branch.refresh_from_db()
        self.assertEqual(
            (branch.store_name, branch.name, branch.phone, branch.address, branch.ntn, branch.receipt_footer),
            ('Tijori Market', 'Shop Branch', '0300 0000000', 'Shop 1', '1234567', 'Thank you'),
        )
        self.assertEqual(Branch.objects.count(), 1)
        terminals = Terminal.objects.filter(branch=branch)
        self.assertEqual(list(terminals.values_list('code', 'name')), [(f'C{i}', f'Counter {i}') for i in range(1, 4)])
        self.assertEqual(dict(terminals.filter(code__in=old_counters).values_list('code', 'pk')), old_counters)
        owner = CustomUser.objects.get(role=UserRole.OWNER)
        self.assertTrue(owner.check_password(self.password))
        self.assertEqual(owner.full_name, 'Shop Owner')
        self.assertEqual(Category.objects.count(), category_count)
        self.assertEqual(RolePermission.objects.count(), permission_count)
        self.assertEqual(json.loads(self.stdout.getvalue()), {
            'ok': True, 'branch': '01', 'owner_email': 'shop@example.com', 'counters': 3,
        })
        self.assertEqual(self.status(), {
            'ok': True, 'configured': True, 'branch': '01', 'store': 'Tijori Market',
            'owner_email': 'shop@example.com', 'counters': 3,
        })
        self.assertNotIn(self.password, self.stdout.getvalue())

    def test_one_counter_by_default_and_unicode_stdin(self):
        self.password += 'éد'
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('TIJORI_OWNER_PASSWORD', None)
            with patch('sys.stdin', io.TextIOWrapper(io.BytesIO((self.password + '\r\n').encode()))):
                call_command('setup_shop', **self.fields, stdout=self.stdout)
        self.assertTrue(CustomUser.objects.get().check_password(self.password))
        self.assertEqual(list(Terminal.objects.filter(active=True).values_list('code', flat=True)), ['C1'])
        self.assertTrue(Terminal.objects.filter(code='C2', active=False).exists())
        self.assertNotIn(self.password, self.stdout.getvalue())

    def test_refuses_existing_owner_unless_forced(self):
        self.configure()
        owner = CustomUser.objects.get()
        with self.assertRaisesMessage(CommandError, 'already exists'):
            self.configure(store='Changed', counters=2)
        self.assertEqual(Branch.objects.get(code='01').store_name, 'Tijori Market')
        self.assertEqual(Terminal.objects.filter(active=True).count(), 1)
        updated_password = secrets.token_urlsafe(24)
        self.configure(force=True, store='Changed', password=updated_password, counters=20)
        self.assertEqual(CustomUser.objects.count(), 1)
        owner.refresh_from_db()
        self.assertTrue(owner.check_password(updated_password))
        self.assertEqual(Branch.objects.get(code='01').store_name, 'Changed')
        self.assertEqual(Terminal.objects.filter(active=True).count(), 20)

    def test_validates_fields_counters_and_password_without_changes(self):
        for kwargs in (
            {'counters': 0}, {'counters': 21}, {'counters': True}, {'counters': '2'}, {'counters': 1.5},
            {'owner_email': 'invalid'}, {'password': '123'}, {'password': 'x' * 1025},
            {'store': 'x' * 256}, {'branch': ' '}, {'owner_name': 'x' * 151}, {'phone': 'x' * 31},
            {'ntn': 'x' * 31}, {'footer': 'x' * 301}, {'address': 'x' * 2001}, {'password': ''},
        ):
            with self.subTest(field=next(iter(kwargs))), self.assertRaises(CommandError):
                self.configure(**kwargs)
        self.assertFalse(CustomUser.objects.exists())
        self.assertEqual(Branch.objects.get(code='01').name, 'Main Branch')
        self.assertEqual(Terminal.objects.filter(active=True).count(), 2)

    def test_never_takes_over_staff_account(self):
        staff = CustomUser.objects.create_user('shop@example.com', self.password, full_name='Cashier')
        with self.assertRaisesMessage(CommandError, 'non-owner'):
            self.configure(force=True)
        staff.refresh_from_db()
        self.assertEqual(staff.role, UserRole.CASHIER)
        self.assertEqual(Branch.objects.get(code='01').store_name, '')

    def test_existing_superuser_counts_as_owner_and_error_is_machine_readable(self):
        staff = CustomUser.objects.create_superuser('admin@example.com', self.password, full_name='Admin', role=UserRole.MANAGER)
        with self.assertRaisesMessage(CommandError, 'already exists'):
            self.configure()
        result = json.loads(self.stdout.getvalue())
        self.assertFalse(result['ok'])
        self.assertIn('already exists', result['error'])
        self.assertNotIn(self.password, self.stdout.getvalue())
        self.assertTrue(self.status()['configured'])
        self.assertEqual(self.status()['owner_email'], staff.email)

    def test_rolls_back_branch_changes_if_counter_has_open_shift(self):
        self.configure(counters=2)
        owner = CustomUser.objects.get()
        Shift.objects.create(terminal=Terminal.objects.get(code='C2'), opened_by=owner, opening_cash=0)
        with self.assertRaisesMessage(CommandError, 'open shifts'):
            self.configure(force=True, store='Changed', counters=1)
        self.assertEqual(Branch.objects.get(code='01').store_name, 'Tijori Market')
        self.assertEqual(Terminal.objects.filter(active=True).count(), 2)
        self.assertTrue(owner.check_password(self.password))
