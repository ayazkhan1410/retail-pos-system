from django.contrib.auth.models import AbstractUser
from django.db import models

from auth.catalog import ALL_PERMISSIONS
from auth.manager import CustomUserManager


class UserRole(models.TextChoices):
    OWNER = 'owner', 'Owner'
    MANAGER = 'manager', 'Manager'
    CASHIER = 'cashier', 'Cashier'
    STOCK_KEEPER = 'stock_keeper', 'Stock Keeper'
    ACCOUNTANT = 'accountant', 'Accountant'


class CustomUser(AbstractUser):
    username = None

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True)
    employee_code = models.CharField(
        max_length=32,
        unique=True,
        blank=True,
        null=True,
        help_text='Staff ID shown on receipts and audit logs.',
    )
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.CASHIER,
        null=True,
        blank=True,
    )

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        verbose_name = 'user'
        verbose_name_plural = 'users'
        ordering = ['full_name', 'email']

    def __str__(self):
        return self.full_name or self.email

    @property
    def is_owner(self):
        return self.role == UserRole.OWNER or self.is_superuser

    @property
    def permission_codes(self):
        if self.is_owner:
            return set(ALL_PERMISSIONS)
        if not hasattr(self, '_permission_codes'):
            self._permission_codes = set(
                RolePermission.objects.filter(role=self.role).values_list('permission', flat=True)
            )
        return self._permission_codes

    def can(self, code):
        return code in self.permission_codes


class RolePermission(models.Model):
    """What each role may do. Owners can edit this in Settings; the owner role itself always has everything."""

    role = models.CharField(max_length=20, choices=UserRole.choices)
    permission = models.CharField(max_length=40)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['role', 'permission'], name='unique_role_permission')]
