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
