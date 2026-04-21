from django.db import models
from residents.models import User


class Venue(models.Model):
    name = models.CharField(max_length=100, unique=True)
    max_capacity = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"], name="venue_name_idx"),
            models.Index(fields=["is_active"], name="venue_active_idx"),
        ]

    def __str__(self):
        status = "active" if self.is_active else "inactive"
        return f"{self.name} ({self.max_capacity}, {status})"


class Event(models.Model):
    EVENT_TYPES = [
        ("mandatory_governance_meetings", "Mandatory Governance Meetings"),
        ("health_and_social_services", "Health and Social Services"),
        ("community_events", "Community Events"),
        ("operations_and_compliance", "Operations and Compliance"),
    ]

    AUDIENCE_CHOICES = [
        ("all", "All Residents"),
        ("kids_only", "Kids/Teens"),
        ("adult_only", "Adults Only"),
        ("pwd", "PWD (Persons with Disabilities)"),
        ("pregnant_mothers", "Pregnant Women / Mothers"),
        ("senior_only", "Senior Citizens Only"),
        ("resident_only", "Residents Only"),
        ("client_only", "Clients Only"),
        ("registered_voter_only", "Registered Voters Only"),
        ("not_yet_voter_only", "Not Yet Voters Only"),
    ]

    STATUS_CHOICES = [
        ("upcoming", "Upcoming"),
        ("ongoing", "Ongoing"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    title = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    event_type = models.CharField(max_length=40, choices=EVENT_TYPES)
    audience_type = models.CharField(max_length=128, default="all")
    date = models.DateTimeField()
    end_date = models.DateTimeField(null=True, blank=True)
    capacity = models.PositiveIntegerField(null=True, blank=True)
    registration_open = models.DateTimeField(null=True, blank=True)
    registration_close = models.DateTimeField(null=True, blank=True)
    venue_ref = models.ForeignKey(
        Venue,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    venue = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="upcoming")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="created_events")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="archived_events",
    )
    archive_status = models.CharField(max_length=20, default="active")
    archive_storage = models.CharField(max_length=20, blank=True)
    archive_key = models.CharField(max_length=512, blank=True)
    archive_checksum = models.CharField(max_length=128, blank=True)
    archive_error = models.TextField(blank=True)
    archived_snapshot = models.JSONField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["date"], name="event_date_idx"),
            models.Index(fields=["event_type"], name="event_type_idx"),
            models.Index(fields=["status"], name="event_status_idx"),
            models.Index(fields=["created_by"], name="event_created_by_idx"),
            models.Index(fields=["updated_at"], name="event_updated_idx"),
            models.Index(fields=["archived_at"], name="event_archived_idx"),
            models.Index(fields=["archive_status"], name="event_archive_status_idx"),
        ]

    def __str__(self):
        return f"{self.title} ({self.get_event_type_display()})"


class EventRegistration(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="registrations")
    resident = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="event_registrations",
        null=True,
        blank=True,
    )
    registered_at = models.DateTimeField(auto_now_add=True)
    attendance_confirmed = models.BooleanField(default=False)

    class Meta:
        unique_together = ("event", "resident")
        indexes = [
            models.Index(fields=["event", "registered_at"], name="reg_event_time_idx"),
            models.Index(fields=["resident"], name="reg_resident_idx"),
        ]

    def __str__(self):
        return f"{self.resident.username} registered for {self.event.title}"


class EventAttendance(models.Model):
    registration = models.OneToOneField(
        "EventRegistration", on_delete=models.CASCADE, related_name="attendance"
    )
    checked_in_at = models.DateTimeField(auto_now_add=True)
    verified_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="verified_attendance",
        null=True,
        blank=True,
    )

    class Meta:
        indexes = [
            models.Index(fields=["registration"], name="att_reg_idx"),
            models.Index(fields=["checked_in_at"], name="att_time_idx"),
            models.Index(fields=["verified_by"], name="att_verifier_idx"),
        ]

    def __str__(self):
        return (
            f"Attendance for {self.registration.resident.username} - "
            f"{self.registration.event.title}"
        )


class EntryLog(models.Model):
    DIRECTION_CHOICES = [
        ("time_in", "Time In"),
        ("time_out", "Time Out"),
    ]
    METHOD_CHOICES = [
        ("qr", "QR"),
        ("face", "Face"),
    ]
    STATUS_CHOICES = [
        ("allowed", "Allowed"),
        ("denied", "Denied"),
    ]

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="entry_logs")
    event = models.ForeignKey(Event, on_delete=models.SET_NULL, null=True, blank=True, related_name="entry_logs")
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES, default="time_in")
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="allowed")
    confidence = models.FloatField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="entry_logs_recorded")
    created_at = models.DateTimeField(auto_now_add=True)
    raw_payload = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["created_at"], name="entrylog_created_idx"),
            models.Index(fields=["direction"], name="entrylog_direction_idx"),
            models.Index(fields=["method"], name="entrylog_method_idx"),
            models.Index(fields=["status"], name="entrylog_status_idx"),
        ]

    def __str__(self):
        return f"EntryLog({self.user_id or 'unknown'} {self.method} {self.status} @ {self.created_at})"
