import hashlib
import json
import os

from common.archive import _write_local_archive, _write_s3_archive
from django.utils import timezone


def _archive_env(name: str, default=""):
    return os.getenv(name, default)


def _serialize_registrations(event):
    rows = []
    for reg in event.registrations.select_related("resident", "resident__profile").order_by("registered_at", "id"):
        resident = getattr(reg, "resident", None)
        profile = getattr(resident, "profile", None) if resident else None
        rows.append(
            {
                "id": reg.id,
                "resident_id": getattr(resident, "id", None),
                "resident_username": getattr(resident, "username", ""),
                "barangay_id": str(getattr(profile, "barangay_id", "")) if profile else None,
                "registered_at": reg.registered_at.isoformat() if reg.registered_at else None,
                "attendance_confirmed": reg.attendance_confirmed,
            }
        )
    return rows


def _serialize_attendance(event):
    rows = []
    for att in event.registrations.select_related("attendance", "attendance__verified_by", "resident").all():
        attendance = getattr(att, "attendance", None)
        if not attendance:
            continue
        rows.append(
            {
                "registration_id": att.id,
                "resident_id": getattr(att.resident, "id", None),
                "resident_username": getattr(att.resident, "username", ""),
                "checked_in_at": attendance.checked_in_at.isoformat() if attendance.checked_in_at else None,
                "verified_by_id": attendance.verified_by_id,
                "verified_by_username": getattr(attendance.verified_by, "username", None),
            }
        )
    return rows


def _serialize_entry_logs(event):
    rows = []
    for log in event.entry_logs.select_related("user", "created_by").order_by("created_at", "id"):
        rows.append(
            {
                "id": log.id,
                "user_id": log.user_id,
                "username": getattr(log.user, "username", ""),
                "direction": log.direction,
                "method": log.method,
                "status": log.status,
                "confidence": log.confidence,
                "created_by_id": log.created_by_id,
                "created_by_username": getattr(log.created_by, "username", None),
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "raw_payload": log.raw_payload,
            }
        )
    return rows


def _serialize_event(event):
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "event_type": event.event_type,
        "date": event.date.isoformat() if event.date else None,
        "end_date": event.end_date.isoformat() if event.end_date else None,
        "capacity": event.capacity,
        "registration_open": event.registration_open.isoformat() if event.registration_open else None,
        "registration_close": event.registration_close.isoformat() if event.registration_close else None,
        "venue": event.venue,
        "status": event.status,
        "created_by_id": event.created_by_id,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "updated_at": event.updated_at.isoformat() if event.updated_at else None,
        "archive_status_before": event.archive_status,
        "registrations_count": event.registrations.count(),
        "attendance_count": event.registrations.filter(attendance__isnull=False).count(),
        "entry_log_count": event.entry_logs.count(),
        "registrations": _serialize_registrations(event),
        "attendance": _serialize_attendance(event),
        "entry_logs": _serialize_entry_logs(event),
        "archived_at": timezone.now().isoformat(),
    }


def archive_event(event, archived_by):
    snapshot = _serialize_event(event)
    payload_text = json.dumps(snapshot, sort_keys=True, indent=2)
    checksum = hashlib.sha256(payload_text.encode("utf-8")).hexdigest()
    timestamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
    key_prefix = (_archive_env("EVENT_ARCHIVE_KEY_PREFIX", "events") or "events").strip("/")
    key = f"{key_prefix}/{timezone.now().year}/{event.id}-{timestamp}.json"
    backend = (_archive_env("EVENT_ARCHIVE_STORAGE_BACKEND", "local") or "local").lower()

    if backend == "s3":
        previous_bucket = os.getenv("ARCHIVE_S3_BUCKET")
        previous_region = os.getenv("ARCHIVE_S3_REGION")
        previous_endpoint = os.getenv("ARCHIVE_S3_ENDPOINT_URL")
        previous_storage_class = os.getenv("ARCHIVE_S3_STORAGE_CLASS")
        previous_sse = os.getenv("ARCHIVE_S3_SSE")
        previous_kms = os.getenv("ARCHIVE_S3_KMS_KEY_ID")
        previous_tags = os.getenv("ARCHIVE_S3_TAGS")
        previous_kind = os.getenv("ARCHIVE_OBJECT_KIND")
        try:
            os.environ["ARCHIVE_S3_BUCKET"] = _archive_env("EVENT_ARCHIVE_S3_BUCKET")
            os.environ["ARCHIVE_S3_REGION"] = _archive_env("EVENT_ARCHIVE_S3_REGION")
            os.environ["ARCHIVE_S3_ENDPOINT_URL"] = _archive_env("EVENT_ARCHIVE_S3_ENDPOINT_URL")
            os.environ["ARCHIVE_S3_STORAGE_CLASS"] = _archive_env("EVENT_ARCHIVE_S3_STORAGE_CLASS", "STANDARD")
            os.environ["ARCHIVE_S3_SSE"] = _archive_env("EVENT_ARCHIVE_S3_SSE", "AES256")
            os.environ["ARCHIVE_S3_KMS_KEY_ID"] = _archive_env("EVENT_ARCHIVE_S3_KMS_KEY_ID")
            os.environ["ARCHIVE_S3_TAGS"] = _archive_env(
                "EVENT_ARCHIVE_S3_TAGS",
                "archive_kind=event,project=egate,barangay=663-a",
            )
            os.environ["ARCHIVE_OBJECT_KIND"] = "event"
            storage_name, storage_key = _write_s3_archive(key, payload_text)
        finally:
            _restore_env("ARCHIVE_S3_BUCKET", previous_bucket)
            _restore_env("ARCHIVE_S3_REGION", previous_region)
            _restore_env("ARCHIVE_S3_ENDPOINT_URL", previous_endpoint)
            _restore_env("ARCHIVE_S3_STORAGE_CLASS", previous_storage_class)
            _restore_env("ARCHIVE_S3_SSE", previous_sse)
            _restore_env("ARCHIVE_S3_KMS_KEY_ID", previous_kms)
            _restore_env("ARCHIVE_S3_TAGS", previous_tags)
            _restore_env("ARCHIVE_OBJECT_KIND", previous_kind)
    else:
        storage_name, storage_key = _write_local_archive(key, payload_text)

    now = timezone.now()
    event.archived_at = now
    event.archived_by = archived_by
    event.archive_status = "archived"
    event.archive_storage = storage_name
    event.archive_key = storage_key
    event.archive_checksum = checksum
    event.archive_error = ""
    event.archived_snapshot = snapshot
    event.save(
        update_fields=[
            "archived_at",
            "archived_by",
            "archive_status",
            "archive_storage",
            "archive_key",
            "archive_checksum",
            "archive_error",
            "archived_snapshot",
            "updated_at",
        ]
    )
    return event


def _restore_env(name, value):
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value
