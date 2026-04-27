import uuid

from django.conf import settings
from django.db import models


class GuestAppointment(models.Model):
    class Status(models.TextChoices):
        EXPECTED = "expected", "Expected"
        ARRIVED = "arrived", "Arrived"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    name = models.CharField(max_length=120)
    organization_company = models.CharField(max_length=160, blank=True)
    no_of_participants = models.PositiveIntegerField(default=1)
    contact = models.CharField(max_length=64, blank=True)
    purpose = models.CharField(max_length=160)
    eta = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.EXPECTED)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="guest_appointments_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="guest_appointments_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    qr_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="guest_appointments_checked_in",
    )
    checked_out_at = models.DateTimeField(null=True, blank=True)
    checked_out_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="guest_appointments_checked_out",
    )
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="guest_appointments_archived",
    )
    archive_status = models.CharField(max_length=20, default="active")
    archive_storage = models.CharField(max_length=20, blank=True)
    archive_key = models.CharField(max_length=512, blank=True)
    archive_checksum = models.CharField(max_length=128, blank=True)
    archive_error = models.TextField(blank=True)
    archived_snapshot = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["eta", "-created_at"]
        indexes = [
            models.Index(fields=["eta"]),
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["qr_token"]),
            models.Index(fields=["checked_in_at"]),
            models.Index(fields=["checked_out_at"]),
            models.Index(fields=["archived_at"]),
            models.Index(fields=["archive_status"]),
        ]

    def __str__(self):
        return f"{self.name} @ {self.eta}"


class GuestAppointmentScanLog(models.Model):
    class Direction(models.TextChoices):
        TIME_IN = "time_in", "Time In"
        TIME_OUT = "time_out", "Time Out"

    class Method(models.TextChoices):
        QR = "qr", "QR"
        MANUAL = "manual", "Manual"

    appointment = models.ForeignKey(
        GuestAppointment,
        on_delete=models.CASCADE,
        related_name="scan_logs",
    )
    direction = models.CharField(max_length=10, choices=Direction.choices)
    method = models.CharField(max_length=10, choices=Method.choices, default=Method.QR)
    reason = models.CharField(max_length=120, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="guest_scan_logs_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["direction"]),
            models.Index(fields=["method"]),
        ]

    def __str__(self):
        return f"GuestAppointmentScanLog({self.appointment_id}, {self.direction}, {self.created_at})"


class ResidentAppointment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        RESCHEDULED = "rescheduled", "Rescheduled"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    resident = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="resident_appointments",
    )
    purpose = models.CharField(max_length=160)
    appointment_at = models.DateTimeField()
    resident_note = models.TextField(blank=True)
    admin_note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resident_appointments_reviewed",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-appointment_at", "-created_at"]
        indexes = [
            models.Index(fields=["resident", "created_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["appointment_at"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.resident_id} - {self.purpose} @ {self.appointment_at}"


class AdminSetting(models.Model):
    key = models.CharField(max_length=64)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="admin_settings",
    )
    value = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "key")
        indexes = [
            models.Index(fields=["key"]),
            models.Index(fields=["updated_at"]),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.key}"


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=64)
    target_type = models.CharField(max_length=64)
    target_id = models.CharField(max_length=64, blank=True)
    target_label = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["action"]),
            models.Index(fields=["target_type", "target_id"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        target = f"{self.target_type}:{self.target_id}" if self.target_id else self.target_type
        return f"{self.action} -> {target}"
