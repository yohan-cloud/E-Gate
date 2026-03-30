from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings
import uuid
from datetime import date, timedelta


# ✅ Fix for expiry_date (lambdas cannot be serialized in migrations)
def default_expiry_date():
    return date.today() + timedelta(days=365)


class User(AbstractUser):
    is_resident = models.BooleanField(default=False)
    is_admin = models.BooleanField(default=False)
    is_gate_operator = models.BooleanField(default=False)


class ResidentProfile(models.Model):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"
        UNSPECIFIED = "unspecified", "Unspecified"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    barangay_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    address = models.CharField(max_length=255)
    birthdate = models.DateField()
    phone_number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    photo = models.ImageField(upload_to='photos/', null=True, blank=True)
    qr_code = models.ImageField(upload_to='qr_codes/', null=True, blank=True)
    date_registered = models.DateField(default=date.today)
    expiry_date = models.DateField(default=default_expiry_date)
    gender = models.CharField(max_length=20, choices=Gender.choices, default=Gender.UNSPECIFIED)
    # Face recognition data (optional)
    face_image = models.ImageField(upload_to='faces/', null=True, blank=True)
    face_embedding = models.JSONField(null=True, blank=True)
    face_updated_at = models.DateTimeField(auto_now=True)
    # Government ID verification
    is_verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.barangay_id}"


class VerificationRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="verification_requests")
    document = models.FileField(upload_to="verifications/")
    note = models.TextField(blank=True)
    admin_note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verification_reviews",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"VerificationRequest({self.user.username}, {self.status})"

