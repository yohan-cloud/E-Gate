import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlencode

from django.conf import settings
from django.utils import timezone


def _serialize_guest_scan_logs(guest):
    logs = []
    for log in guest.scan_logs.order_by("created_at", "id").all():
        logs.append(
            {
                "id": log.id,
                "direction": log.direction,
                "method": log.method,
                "reason": log.reason,
                "created_by_id": log.created_by_id,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
        )
    return logs


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
        "checked_in_at": guest.checked_in_at.isoformat() if guest.checked_in_at else None,
        "checked_in_by_id": guest.checked_in_by_id,
        "checked_out_at": guest.checked_out_at.isoformat() if guest.checked_out_at else None,
        "checked_out_by_id": guest.checked_out_by_id,
        "created_at": guest.created_at.isoformat() if guest.created_at else None,
        "updated_at": guest.updated_at.isoformat() if guest.updated_at else None,
        "created_by_id": guest.created_by_id,
        "updated_by_id": guest.updated_by_id,
        "archive_status_before": guest.archive_status,
        "scan_logs": _serialize_guest_scan_logs(guest),
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
    archive_kind = _archive_env("ARCHIVE_OBJECT_KIND", "guest_appointment").strip() or "guest_appointment"
    put_kwargs = {
        "Bucket": bucket,
        "Key": key,
        "Body": payload_text.encode("utf-8"),
        "ContentType": "application/json",
    }
    sse = _archive_env("ARCHIVE_S3_SSE", "")
    if sse:
        put_kwargs["ServerSideEncryption"] = sse
    kms_key_id = _archive_env("ARCHIVE_S3_KMS_KEY_ID", "")
    if sse == "aws:kms" and kms_key_id:
        put_kwargs["SSEKMSKeyId"] = kms_key_id
    storage_class = _archive_env("ARCHIVE_S3_STORAGE_CLASS", "").strip()
    if storage_class:
        put_kwargs["StorageClass"] = storage_class
    metadata = {
        "archive-kind": archive_kind,
    }
    metadata_prefix = "ARCHIVE_S3_META_"
    for env_name, env_value in os.environ.items():
        if env_name.startswith(metadata_prefix) and env_value:
            metadata_key = env_name[len(metadata_prefix):].strip().lower().replace("_", "-")
            if metadata_key:
                metadata[metadata_key] = env_value.strip()
    if metadata:
        put_kwargs["Metadata"] = metadata
    tag_map = {}
    raw_tags = _archive_env("ARCHIVE_S3_TAGS", "").strip()
    if raw_tags:
        for part in raw_tags.split(","):
            if "=" not in part:
                continue
            tag_key, tag_value = part.split("=", 1)
            tag_key = tag_key.strip()
            tag_value = tag_value.strip()
            if tag_key:
                tag_map[tag_key] = tag_value
    tag_map.setdefault("archive_kind", archive_kind)
    if tag_map:
        put_kwargs["Tagging"] = urlencode(tag_map)
    client.put_object(
        **put_kwargs,
    )
    return "s3", key


def archive_guest_appointment(guest, archived_by):
    snapshot = _serialize_guest(guest)
    payload_text = json.dumps(snapshot, sort_keys=True, indent=2)
    checksum = hashlib.sha256(payload_text.encode("utf-8")).hexdigest()
    timestamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
    key_prefix = (_archive_env("ARCHIVE_KEY_PREFIX", "guest_appointments") or "guest_appointments").strip("/")
    key = f"{key_prefix}/{timezone.now().year}/{guest.id}-{timestamp}.json"
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
