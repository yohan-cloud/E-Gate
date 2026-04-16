import hashlib
import uuid
from django.db import models
from django.utils import timezone


class OutboxEvent(models.Model):
    """
    Reliable outbox item that can be pushed to a cloud node.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    event_type = models.CharField(max_length=128)
    aggregate = models.CharField(max_length=128)
    aggregate_id = models.CharField(max_length=128)
    payload = models.JSONField()
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(null=True, blank=True)
    source_node_id = models.CharField(max_length=64, default="unknown")
    idempotency_key = models.CharField(max_length=256, unique=True)

    class Meta:
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["sent_at"]),
            models.Index(fields=["event_type"]),
            models.Index(fields=["aggregate"]),
        ]

    def mark_error(self, message: str):
        self.attempts += 1
        self.last_error = message
        self.save(update_fields=["attempts", "last_error"])

    @staticmethod
    def build_idempotency_key(event_type: str, aggregate: str, aggregate_id: str, payload) -> str:
        digest = hashlib.sha256(str(payload).encode("utf-8")).hexdigest()
        return f"{event_type}:{aggregate}:{aggregate_id}:{digest}"


class SyncState(models.Model):
    """
    Tracks pull cursor. Single row keyed by name to keep it extensible.
    """

    key = models.CharField(primary_key=True, max_length=32, default="default")
    last_pull_cursor = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_default(cls):
        obj, _ = cls.objects.get_or_create(key="default")
        return obj


class ConflictLog(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    event_type = models.CharField(max_length=128)
    aggregate = models.CharField(max_length=128)
    aggregate_id = models.CharField(max_length=128)
    incoming_updated_at = models.DateTimeField(null=True, blank=True)
    local_updated_at = models.DateTimeField(null=True, blank=True)
    details = models.JSONField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["event_type"]),
            models.Index(fields=["aggregate"]),
        ]
