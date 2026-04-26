from django.db import models
from django.utils import timezone
from django.conf import settings
from accounts.utils import hash_reset_code, verify_reset_code


class PasswordResetCode(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reset_codes")
    # Stores a hash of the 6-digit code (not the raw OTP) for security.
    code = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["user", "code"]),
            models.Index(fields=["expires_at"]),
            models.Index(fields=["used"]),
        ]

    def is_valid(self):
        return not self.used and timezone.now() <= self.expires_at

    def set_code(self, raw_code: str):
        """
        Store a hashed version of the provided code.
        """
        self.code = hash_reset_code(raw_code, self.user_id)

    def matches(self, raw_code: str) -> bool:
        """
        Check whether the provided raw code matches this hashed entry.
        """
        return verify_reset_code(self.code, raw_code, self.user_id)


class GateAuditLog(models.Model):
    class ActionType(models.TextChoices):
        LOGIN_SUCCESS = "login_success", "Successful Login"
        LOGIN_FAILED = "login_failed", "Failed Login"
        LOGOUT = "logout", "Logout"
        QR_SCAN_SUCCESS = "qr_scan_success", "QR Scan Success"
        QR_SCAN_DENIED = "qr_scan_denied", "QR Scan Denied"
        MANUAL_ENTRY = "manual_entry", "Manual Entry"
        PASSWORD_RESET = "password_reset", "Password Reset"
        ACCOUNT_CREATED = "account_created", "Account Created"
        ACCOUNT_DEACTIVATED = "account_deactivated", "Account Deactivated"
        ACCOUNT_REACTIVATED = "account_reactivated", "Account Reactivated"
        ACCOUNT_DELETED = "account_deleted", "Account Deleted"

    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        DENIED = "denied", "Denied"
        WARNING = "warning", "Warning"
        INFO = "info", "Info"

    gate_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="gate_audit_logs",
    )
    gate_username = models.CharField(max_length=150, blank=True)
    gate_full_name = models.CharField(max_length=255, blank=True)
    action_type = models.CharField(max_length=32, choices=ActionType.choices)
    status = models.CharField(max_length=16, choices=Status.choices)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="performed_gate_audit_logs",
    )
    performed_by_label = models.CharField(max_length=255, blank=True)
    details = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["action_type"]),
            models.Index(fields=["status"]),
            models.Index(fields=["gate_user", "created_at"]),
            models.Index(fields=["gate_username"]),
        ]
