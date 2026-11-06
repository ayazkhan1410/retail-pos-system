from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from auth.models import CustomUser, RolePermission


@admin.register(CustomUser)
class CustomUserAdmin(DjangoUserAdmin):
    ordering = ('email',)
    list_display = (
        'id',
        'email',
        'full_name',
        'role',
        'employee_code',
        'phone',
        'is_active',
        'is_staff',
        'is_superuser',
        'last_login',
        'date_joined',
    )
    list_filter = ('role', 'is_active', 'is_staff', 'is_superuser')
    search_fields = ('email', 'full_name', 'employee_code', 'phone')

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Profile', {'fields': ('full_name', 'phone', 'employee_code', 'role')}),
        (
            'Permissions',
            {
                'fields': (
                    'is_active',
                    'is_staff',
                    'is_superuser',
                    'groups',
                    'user_permissions',
                ),
            },
        ),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': (
                    'email',
                    'full_name',
                    'role',
                    'password1',
                    'password2',
                ),
            },
        ),
    )


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ('id', 'role', 'permission')
    list_filter = ('role', 'permission')
    search_fields = ('role', 'permission')
    ordering = ('role', 'permission')
