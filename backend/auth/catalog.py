ALL_PERMISSIONS = [
    'dashboard.view', 'insights.view', 'reports.view',
    'pos.sell', 'pos.discount', 'returns.create',
    'sales.view', 'sales.export',
    'products.edit', 'products.view_cost', 'stock.adjust',
    'suppliers.view', 'suppliers.edit', 'suppliers.pay',
    'purchases.view', 'purchases.edit',
    'customers.view', 'customers.edit', 'customers.collect',
    'expenses.view', 'expenses.edit',
    'settings.store', 'staff.manage', 'backup.run',
]

DEFAULT_ROLE_PERMISSIONS = {
    'manager': [code for code in ALL_PERMISSIONS if code != 'staff.manage'],
    'cashier': ['pos.sell', 'customers.view'],
    'stock_keeper': [
        'products.edit', 'products.view_cost', 'stock.adjust', 'suppliers.view',
        'purchases.view', 'purchases.edit', 'insights.view',
    ],
    'accountant': [
        'dashboard.view', 'reports.view', 'sales.view', 'sales.export', 'products.view_cost',
        'suppliers.view', 'suppliers.pay', 'purchases.view', 'customers.view', 'customers.collect',
        'expenses.view', 'expenses.edit',
    ],
}
