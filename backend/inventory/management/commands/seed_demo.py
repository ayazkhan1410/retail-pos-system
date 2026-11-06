import random
import secrets
import uuid
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from auth.models import CustomUser, UserRole
from customers.models import Customer, CustomerLedgerEntry, post_customer_entry
from finance.models import Expense
from inventory.models import Category, Product, StockMovement, default_branch
from inventory.services import add_batch, move_stock
from sales.models import Sale, SaleReturn, Shift, Terminal
from sales.services import close_shift, create_return, create_sale, expected_cash, open_shift
from suppliers.models import Supplier, SupplierLedgerEntry, post_supplier_entry

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
        parser.add_argument('--password', help='Password for accounts created now. Random if omitted.')
        parser.add_argument('--history', type=int, default=0, help='Also create this many days of made-up sales, for demos only.')

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
                if expiry:
                    add_batch(product, branch, Decimal(stock), expiry)
        if options['history']:
            self._make_history(options['history'], branch)
        self.stdout.write(self.style.SUCCESS('Demo data ready.'))

    def _make_history(self, days, branch):
        """Runs made-up sales through the real sale, return and shift code, then dates them in the past."""
        rng = random.Random(42)
        cashiers = list(CustomUser.objects.filter(email__in=['cashier@smartshop.local', 'cashier2@smartshop.local']))
        terminals = list(Terminal.objects.filter(branch=branch))
        products = [p for p in Product.objects.filter(active=True) if not p.is_expired]
        owner = CustomUser.objects.get(email='owner@smartshop.local')
        now = timezone.localtime()
        # Enough stock for the history, with some items running low so the reorder list has something to say.
        for product in products:
            move_stock(product, branch, Decimal(rng.choice([440, 460, 520, 800, 900])), StockMovement.Reason.PURCHASE, owner, 'DEMO')
        Product.objects.filter(pk__in=[p.pk for p in products]).update(created_at=now - timedelta(days=days + 30))
        for ago in range(days, -1, -1):
            day = now - timedelta(days=ago)
            latest_hour = now.hour if ago == 0 else 21
            for terminal, cashier in zip(terminals, cashiers):
                shift = open_shift(cashier, terminal, Decimal(2000))
                created = []
                for _ in range(rng.randint(14, 30)):
                    picks = rng.sample(products, rng.randint(1, min(4, len(products))))
                    total = sum(p.sale_price() * q for p, q in ((p, 1) for p in picks))
                    sale = create_sale(cashier, {
                        'client_uuid': uuid.uuid4(), 'terminal': terminal, 'discount': Decimal(0),
                        'lines': [{'product': p, 'quantity': Decimal(1)} for p in picks],
                        'payments': [{'method': rng.choice(['cash', 'cash', 'cash', 'jazzcash', 'easypaisa', 'card']), 'amount': total}],
                    })[0]
                    hour = min(rng.choice([10, 11, 12, 13, 16, 17, 18, 18, 19, 19, 20, 20, 21]), latest_hour)
                    Sale.objects.filter(pk=sale.pk).update(created_at=day.replace(hour=hour, minute=rng.randint(0, 59)))
                    created.append(sale)
                if rng.random() < 0.3:
                    sale = rng.choice(created)
                    line = sale.lines.first()
                    create_return(cashier, {'client_uuid': uuid.uuid4(), 'sale': sale, 'terminal': terminal, 'method': 'cash',
                                            'lines': [{'sale_line': line, 'quantity': Decimal(1), 'restock': True}]})
                short = Decimal(rng.choice([0, 0, 0, 0, -50, 20]))
                close_shift(cashier, shift.pk, expected_cash(shift) + short)
                Shift.objects.filter(pk=shift.pk).update(opened_at=day.replace(hour=min(9, latest_hour)), closed_at=day.replace(hour=latest_hour))
                SaleReturn.objects.filter(shift=shift).update(created_at=day.replace(hour=latest_hour))
            if ago % 7 == 0:
                Expense.objects.create(branch=branch, category='salaries', amount=Decimal(35000), date=day.date(), note='Weekly wages', user=owner)
                Expense.objects.create(branch=branch, category='utilities', amount=Decimal(rng.randint(4000, 9000)), date=day.date(), note='Electricity', user=owner)
        Expense.objects.create(branch=branch, category='rent', amount=Decimal(60000), date=(now - timedelta(days=days)).date(), note='Shop rent', user=owner)
        today = now.date()
        lucky = Supplier.objects.create(name='Lucky Beverages', contact_person='Imran Khan', phone='0300-1112223', city='Lahore', payment_type='credit')
        metro = Supplier.objects.create(name='Metro Wholesale', contact_person='Sana Malik', phone='0321-4445556', city='Lahore', payment_type='credit')
        post_supplier_entry(lucky.pk, Decimal(125000), SupplierLedgerEntry.Kind.OPENING, owner)
        post_supplier_entry(metro.pk, Decimal(48000), SupplierLedgerEntry.Kind.OPENING, owner)
        Product.objects.filter(category__name='BEVERAGE').update(supplier=lucky)
        Product.objects.filter(category__name='GROCERY').update(supplier=metro)
        ali = Customer.objects.create(name='Ali Raza', phone='0300-1234567', credit_limit=Decimal(20000))
        post_customer_entry(ali.pk, Decimal(3500), CustomerLedgerEntry.Kind.OPENING, owner)
        Customer.objects.create(name='Bilal Ahmed', phone='0333-7654321', credit_limit=Decimal(10000))
        # Sales used up the short-dated batches, so add a few back for the expiry list to show.
        for name, quantity, expires_in in (("Olper's Milk 1L", 18, 4), ('Bake Parlour Bread', 9, 2), ('Dalda Cooking Oil 1L', 12, 20)):
            product = Product.objects.get(name=name)
            move_stock(product, branch, Decimal(quantity), StockMovement.Reason.PURCHASE, owner, 'DEMO')
            add_batch(product, branch, Decimal(quantity), today + timedelta(days=expires_in))
        olive = Product.objects.create(name='Imported Olive Oil 1L', barcode='200000000110', category=Category.objects.get(name='GROCERY'), cost=Decimal(2400), price=Decimal(2950))
        move_stock(olive, branch, Decimal(14), StockMovement.Reason.OPENING, owner)
        Product.objects.filter(pk=olive.pk).update(created_at=now - timedelta(days=90))
        self.stdout.write(f'Created {days} days of made-up history.')
