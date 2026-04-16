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
from .serializers import ResidentRegisterSerializer, AdminRegisterSerializer, LoginSerializer
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
    profile = getattr(resident, "profile", None)
    if getattr(profile, "deactivated_at", None):
        return Response({"error": "This resident account is deactivated. Please contact the admin."}, status=status.HTTP_403_FORBIDDEN)

    user = authenticate(username=resident.username, password=password)

    if not user:
        return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)
    if not getattr(user, "is_resident", False):
        return Response({"error": "Access denied: Not a resident account"}, status=status.HTTP_403_FORBIDDEN)

    # Fetch resident profile
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

    role = "Administrator" if getattr(user, "is_admin", False) else "GateOperator"
    logger.info(f"[ADMIN LOGIN SUCCESS] Admin/Gate: {username}, Role={role}, Time: {timezone.now()}")

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


# Request OTP for password reset (resident only)
@api_view(["POST"])
@throttle_classes(password_reset_throttles())
def request_password_reset_code(request):
    username = (request.data.get("username") or "").strip()
    if not username:
        return Response({"error": "Username is required."}, status=status.HTTP_400_BAD_REQUEST)
    user = find_user_by_username_case_insensitive(username, is_resident=True)
    if not user or not hasattr(user, "profile"):
        return Response({"error": "Resident not found."}, status=status.HTTP_404_NOT_FOUND)

    stored_email = (user.email or "").strip()
    if not stored_email:
        return Response({"error": "No email address on file for this resident."}, status=status.HTTP_400_BAD_REQUEST)

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
    code = (request.data.get("code") or "").strip()
    new_password = request.data.get("new_password")
    if not all([username, code, new_password]):
        return Response({"error": "Username, code, and new_password are required."}, status=status.HTTP_400_BAD_REQUEST)
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
