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
from inventory.models import Batch, Category, Product, StockLevel, StockMovement, default_branch
from inventory.services import add_batch, move_stock
from sales.models import Payment, Sale, SaleLine, SaleReturn, Shift, Terminal
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

BRANDS = [
    'National', 'Shan', 'Tapal', 'Nestle', 'Olpers', 'Dalda', 'Lifebuoy', 'Lux',
    'Colgate', 'Peek Freans', 'Lu', 'Ismail', 'Mitchells', 'Shezan', 'Pakola',
]
PACKS = ['250g', '500g', '1kg', '2kg', '5kg', '1L', '1.5L', '12pcs', '24pcs']
ITEM_WORDS = [
    'Rice', 'Atta', 'Sugar', 'Salt', 'Oil', 'Tea', 'Milk', 'Soap', 'Shampoo',
    'Biscuit', 'Juice', 'Water', 'Detergent', 'Tissue', 'Noodles', 'Spices',
    'Honey', 'Jam', 'Butter', 'Yogurt', 'Chips', 'Chocolate', 'Coffee', 'Soda',
]
FIRST_NAMES = [
    'Ali', 'Ahmed', 'Hassan', 'Fatima', 'Ayesha', 'Bilal', 'Sara', 'Usman', 'Zainab',
    'Hamza', 'Maryam', 'Omar', 'Sana', 'Imran', 'Nadia', 'Kashif', 'Hira', 'Asad',
]
LAST_NAMES = [
    'Khan', 'Ahmed', 'Ali', 'Malik', 'Raza', 'Hussain', 'Sheikh', 'Butt', 'Chaudhry', 'Mirza',
]
CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Faisalabad', 'Multan', 'Rawalpindi', 'Peshawar', 'Gujranwala']
SUPPLIER_PREFIX = [
    'Metro', 'Lucky', 'Al-Fatah', 'Makro', 'Hypermart', 'Cash & Carry', 'Wholesale Hub',
    'Trade Link', 'Prime Distributors', 'City Mart Supply',
]


class Command(BaseCommand):
    help = 'Creates demo staff, catalog, and optional high-volume history so dashboards look full.'

    def add_arguments(self, parser):
        parser.add_argument('--password', help='Password for accounts created now. Random if omitted.')
        parser.add_argument(
            '--history',
            type=int,
            default=0,
            help='Days of real sale/shift history (slower, uses create_sale).',
        )
        parser.add_argument(
            '--volume',
            action='store_true',
            help='Bulk-seed thousands of products, customers, suppliers, and sales for demos.',
        )
        parser.add_argument('--products', type=int, default=800, help='Extra products when --volume (default 800).')
        parser.add_argument('--customers', type=int, default=250, help='Customers when --volume (default 250).')
        parser.add_argument('--suppliers', type=int, default=40, help='Suppliers when --volume (default 40).')
        parser.add_argument('--sales', type=int, default=3500, help='Bulk sales when --volume (default 3500).')

    def handle(self, *args, **options):
        from inventory.models import Branch

        password = options['password'] or secrets.token_urlsafe(9)
        with transaction.atomic():
            owner = self._seed_staff(password)
            branch = default_branch() or Branch.objects.create(code='MAIN', name='Main Branch')
            self._seed_core_products(owner, branch)
        if options['volume']:
            self._seed_volume(owner, branch, options)
        if options['history']:
            with transaction.atomic():
                self._make_history(options['history'], branch)
        self.stdout.write(self.style.SUCCESS('Demo data ready.'))

    def _seed_staff(self, password):
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
        return owner

    def _seed_core_products(self, owner, branch):
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

    def _seed_volume(self, owner, branch, options):
        """Fast bulk inserts so lists, reports and dashboards look busy."""
        rng = random.Random(7)
        now = timezone.localtime()
        categories = list(Category.objects.all())
        if not categories:
            self.stderr.write('No categories — run migrations first.')
            return

        # --- Suppliers ---
        suppliers = list(Supplier.objects.all())
        want_suppliers = options['suppliers']
        new_suppliers = []
        for i in range(max(0, want_suppliers - len(suppliers))):
            name = f'{rng.choice(SUPPLIER_PREFIX)} {rng.choice(CITIES)} {i + 1}'
            new_suppliers.append(
                Supplier(
                    name=name,
                    contact_person=f'{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}',
                    phone=f'03{rng.randint(10, 49)}-{rng.randint(1000000, 9999999)}',
                    email=f'supplier{i + 1}@demo.pk',
                    city=rng.choice(CITIES),
                    payment_type='credit',
                    status='active',
                    credit_balance=Decimal(rng.randint(0, 250000)),
                ),
            )
        if new_suppliers:
            Supplier.objects.bulk_create(new_suppliers, batch_size=100)
        suppliers = list(Supplier.objects.all())
        self.stdout.write(f'Suppliers: {len(suppliers)}')

        # --- Products + stock (no per-row notifications) ---
        existing = Product.objects.count()
        want_products = options['products']
        to_create = max(0, want_products - existing)
        products_buf = []
        used_barcodes = set(Product.objects.values_list('barcode', flat=True))
        for i in range(to_create):
            barcode = f'29{i + 1:010d}'
            if barcode in used_barcodes:
                continue
            used_barcodes.add(barcode)
            brand = rng.choice(BRANDS)
            pack = rng.choice(PACKS)
            word = rng.choice(ITEM_WORDS)
            cost = Decimal(rng.randint(40, 2500))
            price = (cost * Decimal(rng.choice(['1.12', '1.18', '1.25', '1.35']))).quantize(Decimal('0.01'))
            products_buf.append(
                Product(
                    barcode=barcode,
                    name=f'{brand} {word} {pack}',
                    category=rng.choice(categories),
                    supplier=rng.choice(suppliers) if suppliers else None,
                    brand=brand,
                    cost=cost,
                    price=price,
                    sales_tax_percent=Decimal(rng.choice([0, 0, 18])),
                    threshold=Decimal(rng.choice([5, 8, 10, 15, 20])),
                    active=True,
                ),
            )
        if products_buf:
            Product.objects.bulk_create(products_buf, batch_size=200)
        products = list(Product.objects.filter(active=True).only('id', 'name', 'barcode', 'price', 'cost', 'sales_tax_percent'))
        self.stdout.write(f'Products: {len(products)}')

        # Opening stock levels for anything missing one
        have_levels = set(
            StockLevel.objects.filter(branch=branch).values_list('product_id', flat=True),
        )
        levels = [
            StockLevel(product_id=p.id, branch=branch, quantity=Decimal(rng.randint(5, 400)))
            for p in products
            if p.id not in have_levels
        ]
        if levels:
            StockLevel.objects.bulk_create(levels, batch_size=500)
            # A slice of low-stock for alerts
            low_ids = [lvl.product_id for lvl in levels[:40]]
            StockLevel.objects.filter(product_id__in=low_ids, branch=branch).update(quantity=Decimal(3))

        # --- Customers ---
        have_customers = Customer.objects.count()
        new_customers = []
        for i in range(max(0, options['customers'] - have_customers)):
            new_customers.append(
                Customer(
                    name=f'{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)} {i + 1}',
                    phone=f'03{rng.randint(0, 9)}{rng.randint(0, 9)}-{rng.randint(1000000, 9999999)}',
                    credit_limit=Decimal(rng.choice([5000, 10000, 15000, 20000, 50000])),
                    balance=Decimal(rng.randint(0, 8000)),
                    active=True,
                    address=f'{rng.randint(1, 200)} Demo Street, {rng.choice(CITIES)}',
                ),
            )
        if new_customers:
            Customer.objects.bulk_create(new_customers, batch_size=200)
        customers = list(Customer.objects.filter(active=True))
        self.stdout.write(f'Customers: {len(customers)}')

        # --- Terminals / cashiers ---
        terminals = list(Terminal.objects.filter(branch=branch, active=True))
        if not terminals:
            terminals = [
                Terminal.objects.create(branch=branch, code='T1', name='Counter 1'),
                Terminal.objects.create(branch=branch, code='T2', name='Counter 2'),
            ]
        cashiers = list(
            CustomUser.objects.filter(
                email__in=['cashier@smartshop.local', 'cashier2@smartshop.local', 'owner@smartshop.local'],
            ),
        )
        if not cashiers:
            cashiers = [owner]

        # Closed shifts to hang bulk sales on (constraint: only one open shift per terminal).
        shifts = list(Shift.objects.filter(terminal__in=terminals, closed_at__isnull=False)[:10])
        for terminal in terminals:
            if any(s.terminal_id == terminal.id for s in shifts):
                continue
            # Close any leftover open shift before inserting a demo closed one.
            Shift.objects.filter(terminal=terminal, closed_at__isnull=True).update(
                closed_at=now - timedelta(days=1),
                closed_by=cashiers[0],
                expected_cash=Decimal(2000),
                counted_cash=Decimal(2000),
            )
            shift = Shift.objects.create(
                terminal=terminal,
                opened_by=cashiers[0],
                closed_by=cashiers[0],
                opening_cash=Decimal(2000),
                expected_cash=Decimal(2000),
                counted_cash=Decimal(2000),
            )
            Shift.objects.filter(pk=shift.pk).update(
                opened_at=now - timedelta(days=60),
                closed_at=now - timedelta(days=59),
            )
            shifts.append(Shift.objects.get(pk=shift.pk))
        if not shifts:
            self.stderr.write('No shifts available for bulk sales.')
            return

        # --- Bulk sales ---
        want_sales = options['sales']
        existing_sales = Sale.objects.count()
        to_make = max(0, want_sales - existing_sales)
        methods = ['cash', 'cash', 'cash', 'jazzcash', 'easypaisa', 'card', 'credit']
        sale_rows = []
        line_plan = []  # (sale_index, product, qty, unit_price, tax_rate, line_total, tax_amount)
        payment_plan = []  # (sale_index, method, amount)

        for i in range(to_make):
            day = now - timedelta(days=rng.randint(0, 59), hours=rng.randint(0, 12), minutes=rng.randint(0, 59))
            terminal = rng.choice(terminals)
            shift = rng.choice(shifts)
            cashier = rng.choice(cashiers)
            customer = rng.choice(customers) if customers and rng.random() < 0.35 else None
            picks = rng.sample(products, k=min(len(products), rng.randint(1, 5)))
            subtotal = Decimal(0)
            tax_total = Decimal(0)
            lines_for_sale = []
            for product in picks:
                qty = Decimal(rng.randint(1, 4))
                unit = Decimal(product.price)
                line_net = (unit * qty).quantize(Decimal('0.01'))
                rate = Decimal(product.sales_tax_percent or 0)
                tax_amt = (line_net * rate / Decimal(100)).quantize(Decimal('0.01'))
                subtotal += line_net
                tax_total += tax_amt
                lines_for_sale.append((product, qty, unit, rate, line_net, tax_amt))
            total = subtotal + tax_total
            method = rng.choice(methods)
            if method == 'credit' and customer is None:
                method = 'cash'
            sale_index = len(sale_rows)
            sale_rows.append(
                Sale(
                    client_uuid=uuid.uuid4(),
                    invoice_no=f'DEMO-{100000 + existing_sales + i}',
                    branch=branch,
                    terminal=terminal,
                    shift=shift,
                    cashier=cashier,
                    customer=customer,
                    is_offline=rng.random() < 0.04,
                    subtotal=subtotal,
                    discount=Decimal(0),
                    tax=tax_total,
                    total=total,
                    change_due=Decimal(0),
                ),
            )
            for product, qty, unit, rate, line_net, tax_amt in lines_for_sale:
                line_plan.append((sale_index, product, qty, unit, rate, line_net, tax_amt))
            payment_plan.append((sale_index, method, total))

        if sale_rows:
            # created_at is auto_now_add — set after insert
            Sale.objects.bulk_create(sale_rows, batch_size=200)
            # Reload in invoice order
            created = list(
                Sale.objects.filter(invoice_no__startswith='DEMO-')
                .order_by('id')[existing_sales:existing_sales + len(sale_rows)],
            )
            # Fix timestamps across 60 days
            for sale in created:
                day = now - timedelta(
                    days=rng.randint(0, 59),
                    hours=rng.randint(8, 21),
                    minutes=rng.randint(0, 59),
                )
                Sale.objects.filter(pk=sale.pk).update(created_at=day)

            lines = []
            for sale_index, product, qty, unit, rate, line_net, tax_amt in line_plan:
                if sale_index >= len(created):
                    continue
                sale = created[sale_index]
                lines.append(
                    SaleLine(
                        sale=sale,
                        product_id=product.id,
                        name=product.name,
                        barcode=product.barcode,
                        quantity=qty,
                        unit_price=unit,
                        unit_cost=Decimal(product.cost or 0),
                        discount=Decimal(0),
                        tax_rate=rate,
                        tax_amount=tax_amt,
                        line_total=line_net + tax_amt,
                    ),
                )
            SaleLine.objects.bulk_create(lines, batch_size=500)

            payments = []
            for sale_index, method, amount in payment_plan:
                if sale_index >= len(created):
                    continue
                payments.append(
                    Payment(
                        sale=created[sale_index],
                        method=method,
                        amount=amount,
                        reference='DEMO' if method in ('jazzcash', 'easypaisa', 'card') else '',
                    ),
                )
            Payment.objects.bulk_create(payments, batch_size=500)
        self.stdout.write(f'Sales: {Sale.objects.count()} (added ≈{to_make})')

        # Expenses sprinkled across the period
        if Expense.objects.count() < 80:
            expense_rows = []
            for ago in range(0, 60, 3):
                day = (now - timedelta(days=ago)).date()
                expense_rows.append(
                    Expense(
                        branch=branch,
                        category=rng.choice(['utilities', 'salaries', 'rent', 'other', 'supplies', 'transport']),
                        amount=Decimal(rng.randint(1500, 45000)),
                        date=day,
                        note='Demo expense',
                        user=owner,
                    ),
                )
            Expense.objects.bulk_create(expense_rows, batch_size=100)

        # Near-expiry batches for a few products
        sample = products[:15]
        today = now.date()
        for product in sample:
            Batch.objects.get_or_create(
                product_id=product.id,
                branch=branch,
                expiry_date=today + timedelta(days=rng.randint(1, 10)),
                defaults={'quantity': Decimal(rng.randint(4, 30))},
            )
            Product.objects.filter(pk=product.id).update(
                track_expiry=True,
                expiry_date=today + timedelta(days=rng.randint(1, 10)),
            )

        self.stdout.write(self.style.SUCCESS(
            f'Volume seed done — products={Product.objects.count()}, '
            f'customers={Customer.objects.count()}, sales={Sale.objects.count()}.',
        ))

    def _make_history(self, days, branch):
        """Runs made-up sales through the real sale, return and shift code, then dates them in the past."""
        rng = random.Random(42)
        cashiers = list(CustomUser.objects.filter(email__in=['cashier@smartshop.local', 'cashier2@smartshop.local']))
        terminals = list(Terminal.objects.filter(branch=branch))
        products = [p for p in Product.objects.filter(active=True)[:80] if not p.is_expired]
        owner = CustomUser.objects.get(email='owner@smartshop.local')
        now = timezone.localtime()
        for product in products:
            move_stock(product, branch, Decimal(rng.choice([440, 460, 520, 800, 900])), StockMovement.Reason.PURCHASE, owner, 'DEMO')
        Product.objects.filter(pk__in=[p.pk for p in products]).update(created_at=now - timedelta(days=days + 30))
        for ago in range(days, -1, -1):
            day = now - timedelta(days=ago)
            latest_hour = now.hour if ago == 0 else 21
            for terminal, cashier in zip(terminals, cashiers, strict=False):
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
                if rng.random() < 0.3 and created:
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
        if not Supplier.objects.filter(name='Lucky Beverages').exists():
            Expense.objects.create(branch=branch, category='rent', amount=Decimal(60000), date=(now - timedelta(days=days)).date(), note='Shop rent', user=owner)
            lucky = Supplier.objects.create(name='Lucky Beverages', contact_person='Imran Khan', phone='0300-1112223', city='Lahore', payment_type='credit')
            metro = Supplier.objects.create(name='Metro Wholesale', contact_person='Sana Malik', phone='0321-4445556', city='Lahore', payment_type='credit')
            post_supplier_entry(lucky.pk, Decimal(125000), SupplierLedgerEntry.Kind.OPENING, owner)
            post_supplier_entry(metro.pk, Decimal(48000), SupplierLedgerEntry.Kind.OPENING, owner)
            Product.objects.filter(category__name='BEVERAGE').update(supplier=lucky)
            Product.objects.filter(category__name='GROCERY').update(supplier=metro)
            ali = Customer.objects.create(name='Ali Raza', phone='0300-1234567', credit_limit=Decimal(20000))
            post_customer_entry(ali.pk, Decimal(3500), CustomerLedgerEntry.Kind.OPENING, owner)
            Customer.objects.create(name='Bilal Ahmed', phone='0333-7654321', credit_limit=Decimal(10000))
            today = now.date()
            for name, quantity, expires_in in (("Olper's Milk 1L", 18, 4), ('Bake Parlour Bread', 9, 2), ('Dalda Cooking Oil 1L', 12, 20)):
                product = Product.objects.filter(name=name).first()
                if not product:
                    continue
                move_stock(product, branch, Decimal(quantity), StockMovement.Reason.PURCHASE, owner, 'DEMO')
                add_batch(product, branch, Decimal(quantity), today + timedelta(days=expires_in))
        self.stdout.write(f'Created {days} days of made-up history.')
