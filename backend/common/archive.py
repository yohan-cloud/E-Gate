import hashlib
import json
import os
from pathlib import Path

from django.conf import settings
from django.utils import timezone


def _serialize_guest(guest):
    return {
        "id": guest.id,
        "name": guest.name,
        "organization_company": guest.organization_company,
        "no_of_participants": guest.no_of_participants,
        "contact": guest.contact,
        "purpose": guest.purpose,
        "eta": guest.eta.isoformat() if guest.eta else None,
        "status": guest.status,
        "notes": guest.notes,
        "created_at": guest.created_at.isoformat() if guest.created_at else None,
        "updated_at": guest.updated_at.isoformat() if guest.updated_at else None,
        "created_by_id": guest.created_by_id,
        "updated_by_id": guest.updated_by_id,
        "archived_at": timezone.now().isoformat(),
    }


def _archive_env(name, default=""):
    return os.getenv(name, default)


def _write_local_archive(key: str, payload_text: str):
    archive_root = Path(getattr(settings, "ARCHIVE_ROOT", settings.BASE_DIR / "archive_exports"))
    path = archive_root / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload_text, encoding="utf-8")
    return "local", str(path)


def _write_s3_archive(key: str, payload_text: str):
    bucket = _archive_env("ARCHIVE_S3_BUCKET")
    region = _archive_env("ARCHIVE_S3_REGION")
    if not bucket:
        raise RuntimeError("ARCHIVE_S3_BUCKET is not configured.")
    try:
        import boto3  # type: ignore
    except Exception as exc:
        raise RuntimeError("boto3 is not installed.") from exc

    client_kwargs = {}
    if region:
        client_kwargs["region_name"] = region
    endpoint_url = _archive_env("ARCHIVE_S3_ENDPOINT_URL")
    if endpoint_url:
        client_kwargs["endpoint_url"] = endpoint_url
    client = boto3.client("s3", **client_kwargs)
    put_kwargs = {
        "Bucket": bucket,
        "Key": key,
        "Body": payload_text.encode("utf-8"),
        "ContentType": "application/json",
    }
    sse = _archive_env("ARCHIVE_S3_SSE", "")
    if sse:
        put_kwargs["ServerSideEncryption"] = sse
    client.put_object(
        **put_kwargs,
    )
    return "s3", key


def archive_guest_appointment(guest, archived_by):
    snapshot = _serialize_guest(guest)
    payload_text = json.dumps(snapshot, sort_keys=True, indent=2)
    checksum = hashlib.sha256(payload_text.encode("utf-8")).hexdigest()
    timestamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
    key = f"guest_appointments/{timezone.now().year}/{guest.id}-{timestamp}.json"
    backend = (_archive_env("ARCHIVE_STORAGE_BACKEND", "local") or "local").lower()

    if backend == "s3":
        storage_name, storage_key = _write_s3_archive(key, payload_text)
    else:
        storage_name, storage_key = _write_local_archive(key, payload_text)

    now = timezone.now()
    guest.archived_at = now
    guest.archived_by = archived_by
    guest.archive_status = "archived"
    guest.archive_storage = storage_name
    guest.archive_key = storage_key
    guest.archive_checksum = checksum
    guest.archive_error = ""
    guest.archived_snapshot = snapshot
    guest.save(
        update_fields=[
            "archived_at",
            "archived_by",
            "archive_status",
            "archive_storage",
            "archive_key",
            "archive_checksum",
            "archive_error",
            "archived_snapshot",
        ]
    )
    return guest
