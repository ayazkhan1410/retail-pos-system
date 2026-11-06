from rest_framework.permissions import SAFE_METHODS, BasePermission


def requires(read=None, write=None):
    """Permission class for a view. Reads need `read` and writes need `write`; None means any logged-in user."""

    class Requires(BasePermission):
        def has_permission(self, request, view):
            if not request.user.is_authenticated:
                return False
            code = read if request.method in SAFE_METHODS else write
            return code is None or request.user.can(code)

    return Requires


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.is_owner)
