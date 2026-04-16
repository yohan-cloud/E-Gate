import hashlib
import hmac
from django.conf import settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken


def generate_token_response(user, message, role=None, profile_data=None):
    """Standard JSON response with JWT tokens and user metadata."""
    refresh = RefreshToken.for_user(user)

    response = {
        "message": message,
        "tokens": {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        },
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_admin": getattr(user, "is_admin", False),
            "is_staff": getattr(user, "is_staff", False),
            "is_resident": getattr(user, "is_resident", False),
            "must_change_password": getattr(user, "must_change_password", False),
            "last_login": str(user.last_login) if user.last_login else None,
            "date_joined": str(user.date_joined),
        },
        "meta": {
            "role": role or "User",
            "login_time": str(timezone.now()),
        },
    }

    if profile_data:
        response["user"]["profile"] = profile_data

    return response


def hash_reset_code(raw_code: str, user_id: int) -> str:
    """
    Hash a user-specific reset code using the secret key to avoid storing plaintext codes.
    """
    payload = f"{raw_code}:{user_id}:{settings.SECRET_KEY}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def verify_reset_code(stored_hash: str, candidate: str, user_id: int) -> bool:
    """
    Constant-time compare of a candidate code against the stored hash.
    """
    expected = hash_reset_code(candidate, user_id)
    return hmac.compare_digest(stored_hash, expected)
