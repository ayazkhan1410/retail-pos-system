from django.contrib.auth.models import AbstractUser
from django.db import models

from auth.manager import CustomUserManager


class UserRole(models.TextChoices):
    """POS roles — wire to Django groups/permissions in a later phase."""

    OWNER = 'owner', 'Owner'
    MANAGER = 'manager', 'Manager'
    CASHIER = 'cashier', 'Cashier'


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
    def is_manager(self):
        return self.role in (UserRole.OWNER, UserRole.MANAGER) or self.is_superuser

    @property
    def is_cashier(self):
        return self.role == UserRole.CASHIER
