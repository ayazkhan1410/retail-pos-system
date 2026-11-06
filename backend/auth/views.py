from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from audit.models import log_event
from auth.catalog import ALL_PERMISSIONS
from auth.models import CustomUser, RolePermission, UserRole
from auth.permissions import IsOwner, requires
from auth.serializers import UserSerializer


@method_decorator(ensure_csrf_cookie, name='dispatch')
class SessionView(APIView):
    """Sets the CSRF cookie and tells the app who is logged in, if anyone."""

    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user
        return Response({'user': UserSerializer(user).data if user.is_authenticated else None})


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        user = authenticate(
            request,
            username=str(request.data.get('email', '')).strip(),
            password=str(request.data.get('password', '')),
        )
        if user is None:
            log_event(None, 'login_failed', str(request.data.get('email', ''))[:200])
            return Response({'detail': 'Incorrect email or password.'}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)
        log_event(user, 'login', user.email)
        return Response({'user': UserSerializer(user).data})


class LogoutView(APIView):
    def post(self, request):
        log_event(request.user, 'logout', request.user.email)
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SwitchByPinView(APIView):
    """Quick cashier switch on an open till — PIN only, no email/password."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        pin = str(request.data.get('pin', '')).strip()
        if not pin.isdigit() or not (4 <= len(pin) <= 6):
            return Response({'detail': 'Enter a 4-6 digit PIN.'}, status=status.HTTP_400_BAD_REQUEST)
        for user in CustomUser.objects.filter(is_active=True).exclude(pin='').iterator(chunk_size=100):
            if check_password(pin, user.pin):
                login(request, user)
                log_event(user, 'login', user.email, {'via': 'pin'})
                return Response({'user': UserSerializer(user).data})
        return Response({'detail': 'Incorrect PIN.'}, status=status.HTTP_400_BAD_REQUEST)


class UserListCreateView(generics.ListCreateAPIView):
    permission_classes = [requires('staff.manage', 'staff.manage')]
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    pagination_class = None

    def perform_create(self, serializer):
        user = serializer.save()
        log_event(self.request.user, 'user_created', user.email, {'role': user.role})


class UserDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [requires('staff.manage', 'staff.manage')]
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer

    def perform_update(self, serializer):
        target = serializer.instance
        data = serializer.validated_data
        if target.is_owner and not self.request.user.is_owner:
            raise ValidationError({'detail': 'Only an owner can change an owner account.'})
        if target == self.request.user and (data.get('is_active') is False or data.get('role', target.role) != target.role):
            raise ValidationError({'detail': 'You cannot deactivate or change the role of your own account.'})
        user = serializer.save()
        log_event(self.request.user, 'user_updated', user.email, {'fields': sorted(data)})


class RolePermissionsView(APIView):
    """The role and permission matrix. Owner only, so nobody can grant themselves more access."""

    permission_classes = [IsOwner]

    def get(self, request):
        return Response(self._matrix())

    def put(self, request):
        role = request.data.get('role')
        codes = request.data.get('permissions')
        editable = [value for value, _ in UserRole.choices if value != UserRole.OWNER]
        if role not in editable or not isinstance(codes, list) or not set(codes) <= set(ALL_PERMISSIONS):
            raise ValidationError({'detail': 'Unknown role or permission.'})
        with transaction.atomic():
            RolePermission.objects.filter(role=role).delete()
            RolePermission.objects.bulk_create([RolePermission(role=role, permission=code) for code in set(codes)])
            log_event(request.user, 'role_updated', role, {'permissions': sorted(codes)})
        return Response(self._matrix())

    @staticmethod
    def _matrix():
        roles = {value: [] for value, _ in UserRole.choices if value != UserRole.OWNER}
        for role, code in RolePermission.objects.values_list('role', 'permission'):
            if role in roles:
                roles[role].append(code)
        return {'permissions': ALL_PERMISSIONS, 'roles': roles}
