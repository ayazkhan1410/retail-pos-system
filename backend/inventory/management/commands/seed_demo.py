import secrets
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from auth.models import CustomUser, UserRole
from inventory.models import Category, Product, StockMovement, default_branch
from inventory.services import move_stock

# name, barcode, category, cost, price, stock, tax %, days until expiry
PRODUCTS = [
    ('Super Basmati Rice 5kg', '200000000011', 'GROCERY', 1520, 1850, 45, 0, None),
    ('Dalda Cooking Oil 1L', '200000000028', 'GROCERY', 445, 520, 8, 18, 12),
    ('Ashrafi Atta 2kg', '200000000035', 'GROCERY', 235, 280, 120, 0, 45),
    ('Shakkar 1kg', '200000000042', 'GROCERY', 140, 165, 200, 0, None),
    ('National Salt 800g', '200000000059', 'GROCERY', 42, 55, 350, 0, None),
    ("Olper's Milk 1L", '200000000066', 'DAIRY', 255, 290, 22, 0, 5),
    ('Bake Parlour Bread', '200000000073', 'BAKERY', 95, 120, 5, 0, 2),
    ('Tapal Danedar 475g', '200000000080', 'BEVERAGE', 780, 890, 34, 18, None),
    ('Sprite 1.5 LTR', '200000000097', 'BEVERAGE', 125, 140, 48, 18, 180),
    ('Nescafe Mocha 210ml', '200000000103', 'BEVERAGE', 125, 140, 36, 18, -3),
]


class Command(BaseCommand):
    help = 'Creates demo staff and products. Safe to run twice.'

    def add_arguments(self, parser):
        parser.add_argument('--password', help='Password for both demo accounts. Random if omitted.')

    @transaction.atomic
    def handle(self, *args, **options):
        password = options['password'] or secrets.token_urlsafe(9)
        staff = [
            ('admin@smartshop.local', 'System Admin', UserRole.OWNER, True),
            ('owner@smartshop.local', 'Demo Owner', UserRole.OWNER, False),
            ('manager@smartshop.local', 'Demo Manager', UserRole.MANAGER, False),
            ('cashier@smartshop.local', 'Demo Cashier', UserRole.CASHIER, False),
            ('cashier2@smartshop.local', 'Second Cashier', UserRole.CASHIER, False),
            ('stock@smartshop.local', 'Demo Stock Keeper', UserRole.STOCK_KEEPER, False),
            ('accounts@smartshop.local', 'Demo Accountant', UserRole.ACCOUNTANT, False),
        ]
        owner = None
        for email, name, role, is_admin in staff:
            user = CustomUser.objects.filter(email=email).first()
            if user:
                self.stdout.write(f'{email} already exists, password unchanged')
            elif is_admin:
                user = CustomUser.objects.create_superuser(email, password, full_name=name)
                self.stdout.write(f'Created {email} (superuser)')
            else:
                user = CustomUser.objects.create_user(email, password, full_name=name, role=role)
                self.stdout.write(f'Created {email} ({role})')
            owner = owner or user
        self.stdout.write(f'Password for accounts created now: {password}')

        branch = default_branch()
        for name, barcode, category, cost, price, stock, tax, expiry_days in PRODUCTS:
            expiry = timezone.localdate() + timedelta(days=expiry_days) if expiry_days is not None else None
            product, created = Product.objects.get_or_create(
                barcode=barcode,
                defaults={
                    'name': name,
                    'category': Category.objects.get(name=category),
                    'cost': Decimal(cost),
                    'price': Decimal(price),
                    'sales_tax_percent': Decimal(tax),
                    'expiry_date': expiry,
                    'track_expiry': expiry is not None,
                },
            )
            if created:
                move_stock(product, branch, Decimal(stock), StockMovement.Reason.OPENING, owner)
        self.stdout.write(self.style.SUCCESS('Demo data ready.'))
