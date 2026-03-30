from django.conf import settings
from rest_framework.permissions import BasePermission


class IsAdminUserRole(BasePermission):
    message = "Access denied: Admins only."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and getattr(user, "is_admin", False))


class IsGateOperatorRole(BasePermission):
    message = "Access denied: Gate operators only."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and getattr(user, "is_gate_operator", False))


class IsAdminOrGateOperatorRole(BasePermission):
    message = "Access denied: Admins or Gate Operators only."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and (getattr(user, "is_admin", False) or getattr(user, "is_gate_operator", False))
        )


class IsResidentUserRole(BasePermission):
    message = "Access denied: Residents only."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and getattr(user, "is_resident", False))


class IsGateAccessAllowed(BasePermission):
    message = "Access denied: Gate access requires an admin or gate operator account."

    def has_permission(self, request, view):
        if getattr(settings, "ALLOW_PUBLIC_GATE", False):
            return True
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and (getattr(user, "is_admin", False) or getattr(user, "is_gate_operator", False))
        )
