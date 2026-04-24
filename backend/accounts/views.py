"""
accounts/views.py
-----------------
Handles registration, authentication, and token management
for both Resident and Admin users.

Maintainer: E-Gate Backend Team (Adamson University)
"""

from django.utils import timezone
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.mail import send_mail
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import ResidentRegisterSerializer, AdminRegisterSerializer, GateOperatorRegisterSerializer, LoginSerializer
from .utils import generate_token_response as unified_generate_token_response
from .permissions import IsAdminUserRole
from accounts.models import PasswordResetCode
from datetime import timedelta
import secrets
import logging
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle
from common.audit import audit_log

User = get_user_model()
logger = logging.getLogger("accounts")


class PasswordResetUserThrottle(UserRateThrottle):
    scope = "password_reset_user"
    rate = "4/10min"

    def parse_rate(self, rate):
        if rate == "4/10min":
            return 4, 600
        return super().parse_rate(rate)


class PasswordResetAnonThrottle(AnonRateThrottle):
    scope = "password_reset_anon"
    rate = "4/10min"

    def parse_rate(self, rate):
        if rate == "4/10min":
            return 4, 600
        return super().parse_rate(rate)


def password_reset_throttles():
    return [] if settings.DEBUG else [PasswordResetUserThrottle, PasswordResetAnonThrottle]


def find_user_by_username_case_insensitive(raw_username, **filters):
    username = (raw_username or "").strip()
    if not username:
        return None

    base_qs = User.objects.filter(**filters)
    exact_match = base_qs.filter(username=username).first()
    if exact_match:
        return exact_match

    matches = list(base_qs.filter(username__iexact=username)[:2])
    if len(matches) == 1:
        return matches[0]
    return None


def build_login_payload(user, request, username_for_logs=None):
    if getattr(user, "is_resident", False):
        profile = getattr(user, "profile", None)
        if getattr(profile, "deactivated_at", None):
            return None, Response(
                {"error": "This resident account is deactivated. Please contact the admin."},
                status=status.HTTP_403_FORBIDDEN,
            )

        profile_data = None
        if profile is not None:
            profile_data = {
                "barangay_id": str(profile.barangay_id),
                "address": profile.address,
                "birthdate": str(profile.birthdate),
                "date_registered": str(profile.date_registered),
                "expiry_date": str(profile.expiry_date),
            }

        response_data = unified_generate_token_response(
            user,
            message="Resident login successful",
            role="Resident",
            profile_data=profile_data,
        )
        audit_log(
            request,
            actor=user,
            action="login_success",
            target_type="auth",
            target_id=user.id,
            target_label=user.username,
            metadata={"role": "Resident"},
        )
        return response_data, None

    if getattr(user, "is_admin", False) or getattr(user, "is_gate_operator", False):
        role = "Administrator" if getattr(user, "is_admin", False) else "GateOperator"
        logger.info(
            f"[ADMIN LOGIN SUCCESS] Admin/Gate: {username_for_logs or user.username}, "
            f"Role={role}, Time: {timezone.now()}"
        )
        response_data = unified_generate_token_response(
            user,
            message="Admin login successful" if role == "Administrator" else "Gate Operator login successful",
            role=role,
        )
        audit_log(
            request,
            actor=user,
            action="login_success",
            target_type="auth",
            target_id=user.id,
            target_label=user.username,
            metadata={"role": role},
        )
        return response_data, None

    return None, Response({"error": "Access denied: Account role is not supported"}, status=status.HTTP_403_FORBIDDEN)


# Register Resident
@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def register_resident(request):
    """
    Admin-only endpoint to create/encode resident accounts.
    """
    serializer = ResidentRegisterSerializer(data=request.data, context={"request": request})
    if serializer.is_valid():
        user = serializer.save()
        return Response(
            {
                "message": "Resident registered successfully",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "is_resident": getattr(user, "is_resident", False),
                    "is_verified": getattr(getattr(user, "profile", None), "is_verified", False),
                    "verified_at": str(getattr(getattr(user, "profile", None), "verified_at", "") or ""),
                    "date_joined": str(user.date_joined),
                },
            },
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# Register Admin
@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def register_admin(request):
    """
    Registers a new admin account for system management.
    """
    serializer = AdminRegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        audit_log(
            request,
            actor=request.user,
            action="admin_create",
            target_type="admin_account",
            target_id=user.id,
            target_label=user.username,
            metadata={"email": user.email or ""},
        )
        return Response(
            {
                "message": "Admin account created successfully",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "is_admin": getattr(user, "is_admin", False),
                    "is_staff": getattr(user, "is_staff", False),
                },
            },
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def register_gate_operator(request):
    """
    Registers a new gate operator account for gate portal access.
    """
    serializer = GateOperatorRegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        audit_log(
            request,
            actor=request.user,
            action="gate_operator_create",
            target_type="gate_operator_account",
            target_id=user.id,
            target_label=user.username,
            metadata={"email": user.email or ""},
        )
        return Response(
            {
                "message": "Gate operator account created successfully",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "full_name": user.get_full_name().strip(),
                    "email": user.email,
                    "contact_number": getattr(user, "contact_number", "") or "",
                    "is_gate_operator": getattr(user, "is_gate_operator", False),
                    "is_active": user.is_active,
                },
            },
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def list_gate_operators(request):
    query = (request.query_params.get("q") or "").strip()
    users = User.objects.filter(is_gate_operator=True, is_admin=False, is_resident=False).order_by("-date_joined")
    if query:
        users = users.filter(
            username__icontains=query,
        ) | users.filter(
            email__icontains=query,
        ) | users.filter(
            first_name__icontains=query,
        ) | users.filter(
            last_name__icontains=query,
        ) | users.filter(
            contact_number__icontains=query,
        )
    data = [
        {
            "id": user.id,
            "full_name": user.get_full_name().strip() or user.username,
            "username": user.username,
            "email": user.email,
            "contact_number": getattr(user, "contact_number", "") or "",
            "is_active": user.is_active,
            "date_joined": str(user.date_joined),
            "last_login": str(user.last_login) if user.last_login else None,
        }
        for user in users.distinct()
    ]
    audit_log(
        request,
        actor=request.user,
        action="gate_operator_list_view",
        target_type="gate_operator_account",
        target_label="gate operator directory",
        metadata={"query": query, "result_count": len(data)},
    )
    return Response(data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def reset_gate_operator_password(request, user_id):
    user = User.objects.filter(id=user_id, is_gate_operator=True, is_admin=False, is_resident=False).first()
    if not user:
        return Response({"error": "Gate operator not found."}, status=status.HTTP_404_NOT_FOUND)

    temporary_password = (request.data.get("temporary_password") or "").strip()
    if not temporary_password:
        return Response({"error": "Temporary password is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(temporary_password, user=user)
    except Exception as exc:
        return Response(
            {"error": list(getattr(exc, "messages", ["Password invalid."]))},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(temporary_password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    PasswordResetCode.objects.filter(user=user, used=False).update(used=True)
    audit_log(
        request,
        actor=request.user,
        action="gate_operator_password_reset",
        target_type="gate_operator_account",
        target_id=user.id,
        target_label=user.username,
        metadata={"must_change_password": True},
    )
    return Response(
        {"message": "Temporary password set. The gate operator must change it after login.", "must_change_password": True},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def toggle_gate_operator_active(request, user_id):
    user = User.objects.filter(id=user_id, is_gate_operator=True, is_admin=False, is_resident=False).first()
    if not user:
        return Response({"error": "Gate operator not found."}, status=status.HTTP_404_NOT_FOUND)

    next_active = bool(request.data.get("is_active", not user.is_active))
    reason = (request.data.get("reason") or "").strip()
    if not next_active and not reason:
        return Response({"error": "Reason is required when deactivating a gate operator."}, status=status.HTTP_400_BAD_REQUEST)
    user.is_active = next_active
    user.save(update_fields=["is_active"])
    audit_log(
        request,
        actor=request.user,
        action="gate_operator_reactivate" if next_active else "gate_operator_deactivate",
        target_type="gate_operator_account",
        target_id=user.id,
        target_label=user.username,
        metadata={"is_active": next_active, "reason": reason},
    )
    return Response(
        {"message": "Gate operator activated." if next_active else "Gate operator deactivated.", "is_active": next_active},
        status=status.HTTP_200_OK,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def delete_gate_operator(request, user_id):
    user = User.objects.filter(id=user_id, is_gate_operator=True, is_admin=False, is_resident=False).first()
    if not user:
        return Response({"error": "Gate operator not found."}, status=status.HTTP_404_NOT_FOUND)

    audit_log(
        request,
        actor=request.user,
        action="gate_operator_delete",
        target_type="gate_operator_account",
        target_id=user.id,
        target_label=user.username,
        metadata={"email": user.email or ""},
    )
    user.delete()
    return Response({"message": "Gate operator deleted."}, status=status.HTTP_200_OK)


# Login Resident
@api_view(["POST"])
def login_resident(request):
    """
    Authenticates a resident and returns access/refresh tokens.
    """
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    username = serializer.validated_data["username"].strip()
    password = serializer.validated_data["password"]
    resident = find_user_by_username_case_insensitive(username, is_resident=True)
    if not resident:
        return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)
    if getattr(getattr(resident, "profile", None), "deactivated_at", None):
        return Response({"error": "This resident account is deactivated. Please contact the admin."}, status=status.HTTP_403_FORBIDDEN)
    user = authenticate(username=resident.username, password=password)

    if not user:
        return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)
    if not getattr(user, "is_resident", False):
        return Response({"error": "Access denied: Not a resident account"}, status=status.HTTP_403_FORBIDDEN)
    response_data, error_response = build_login_payload(user, request, username_for_logs=username)
    if error_response is not None:
        return error_response
    return Response(response_data, status=status.HTTP_200_OK)


# Login Admin (also allows Gate Operators with limited role)
@api_view(["POST"])
def login_admin(request):
    """
    Authenticates an admin or gate operator and returns access/refresh tokens.
    """
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    username = serializer.validated_data["username"].strip()
    password = serializer.validated_data["password"]
    candidate = find_user_by_username_case_insensitive(username)
    user = authenticate(username=candidate.username, password=password) if candidate else None

    if not user:
        logger.warning(f"[FAILED ADMIN LOGIN] Username: {username}, Time: {timezone.now()}")
        return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)

    if not (getattr(user, "is_admin", False) or getattr(user, "is_gate_operator", False)):
        logger.warning(f"[UNAUTHORIZED ADMIN LOGIN] Username: {username}, Time: {timezone.now()}")
        return Response({"error": "Access denied: Not an admin account"}, status=status.HTTP_403_FORBIDDEN)

    response_data, error_response = build_login_payload(user, request, username_for_logs=username)
    if error_response is not None:
        return error_response
    return Response(response_data, status=status.HTTP_200_OK)


@api_view(["POST"])
def login_user(request):
    """
    Authenticates any supported account type using a single username/password login flow.
    """
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    username = serializer.validated_data["username"].strip()
    password = serializer.validated_data["password"]
    candidate = find_user_by_username_case_insensitive(username)
    if candidate and getattr(candidate, "is_resident", False):
        if getattr(getattr(candidate, "profile", None), "deactivated_at", None):
            return Response(
                {"error": "This resident account is deactivated. Please contact the admin."},
                status=status.HTTP_403_FORBIDDEN,
            )
    user = authenticate(username=candidate.username, password=password) if candidate else None

    if not user:
        logger.warning(f"[FAILED UNIFIED LOGIN] Username: {username}, Time: {timezone.now()}")
        return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)

    response_data, error_response = build_login_payload(user, request, username_for_logs=username)
    if error_response is not None:
        return error_response
    return Response(response_data, status=status.HTTP_200_OK)


# Logout (Blacklist refresh token)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_user(request):
    """
    Blacklists the refresh token to invalidate further use.
    """
    refresh_token = request.data.get("refresh_token")
    if not refresh_token:
        # Idempotent: consider already logged out if no token provided
        return Response({"message": "Logged out"}, status=status.HTTP_205_RESET_CONTENT)
    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
    except Exception as e:
        # Treat blacklisted/invalid tokens as already logged out
        logger.info(f"[LOGOUT IDP] {str(e)}")
    return Response({"message": "Logged out"}, status=status.HTTP_205_RESET_CONTENT)


# Request OTP for password reset
@api_view(["POST"])
@throttle_classes(password_reset_throttles())
def request_password_reset_code(request):
    username = (request.data.get("username") or "").strip()
    account_type = (request.data.get("account_type") or "resident").strip().lower()
    if not username:
        return Response({"error": "Username is required."}, status=status.HTTP_400_BAD_REQUEST)
    if account_type in {"admin", "operations", "gate"}:
        user = find_user_by_username_case_insensitive(username)
        if not user or not (getattr(user, "is_admin", False) or getattr(user, "is_gate_operator", False)):
            return Response({"error": "Operations account not found."}, status=status.HTTP_404_NOT_FOUND)
        account_label = "operations"
    else:
        user = find_user_by_username_case_insensitive(username, is_resident=True)
        if not user or not hasattr(user, "profile"):
            return Response({"error": "Resident not found."}, status=status.HTTP_404_NOT_FOUND)
        account_label = "resident"

    stored_email = (user.email or "").strip()
    if not stored_email:
        return Response({"error": f"No email address on file for this {account_label} account."}, status=status.HTTP_400_BAD_REQUEST)

    # Invalidate any previously issued (unused) codes before issuing a new one
    PasswordResetCode.objects.filter(user=user, used=False).update(used=True)

    # generate code (6-digit) and store hashed version only
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires = timezone.now() + timedelta(minutes=10)
    prc = PasswordResetCode(user=user, expires_at=expires)
    prc.set_code(code)
    prc.save()

    subject = "E-Gate password reset code"
    message = (
        f"Hello {user.username},\n\n"
        f"Your E-Gate password reset code is: {code}\n\n"
        "This code will expire in 10 minutes. If you did not request a password reset, you can ignore this email."
    )

    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [stored_email],
            fail_silently=False,
        )
    except Exception as exc:
        logger.exception(f"[RESET_OTP_EMAIL_FAILED] user={user.username} error={exc}")
        return Response(
            {"error": "Failed to send reset email. Please try again later."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    logger.info(
        f"[RESET_OTP_REQUEST] user={user.username} email={stored_email} "
        f"code={'debug:' + code if settings.DEBUG else 'issued'}"
    )

    response = {
        "message": "Reset code sent to your email.",
        "delivery": "email",
    }

    return Response(response, status=status.HTTP_200_OK)


@api_view(["POST"])
@throttle_classes(password_reset_throttles())
def reset_password_with_code(request):
    username = (request.data.get("username") or "").strip()
    account_type = (request.data.get("account_type") or "resident").strip().lower()
    code = (request.data.get("code") or "").strip()
    new_password = request.data.get("new_password")
    if not all([username, code, new_password]):
        return Response({"error": "Username, code, and new_password are required."}, status=status.HTTP_400_BAD_REQUEST)
    if account_type in {"admin", "operations", "gate"}:
        user = find_user_by_username_case_insensitive(username)
        if not user or not (getattr(user, "is_admin", False) or getattr(user, "is_gate_operator", False)):
            return Response({"error": "Operations account not found."}, status=status.HTTP_404_NOT_FOUND)
    else:
        user = find_user_by_username_case_insensitive(username, is_resident=True)
        if not user:
            return Response({"error": "Resident not found."}, status=status.HTTP_404_NOT_FOUND)

    prc = (
        PasswordResetCode.objects.filter(user=user, used=False)
        .order_by("-created_at")
        .first()
    )
    if not prc or not prc.is_valid():
        return Response({"error": "Invalid or expired code."}, status=status.HTTP_400_BAD_REQUEST)
    # Only the most recent valid code is accepted
    if not prc.matches(code):
        return Response({"error": "Invalid or expired code."}, status=status.HTTP_400_BAD_REQUEST)

    # validate password
    try:
        from django.contrib.auth.password_validation import validate_password as vp

        vp(new_password, user=user)
    except Exception as e:
        return Response({"error": list(getattr(e, "messages", ["Password invalid."]))}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])
    prc.used = True
    prc.save(update_fields=["used"])
    # Immediately invalidate any other outstanding codes
    PasswordResetCode.objects.filter(user=user, used=False).update(used=True)
    return Response({"message": "Password reset successful. You can now log in."}, status=status.HTTP_200_OK)
