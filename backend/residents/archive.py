import hashlib
import json
import os

from common.archive import _write_local_archive, _write_s3_archive
from django.utils import timezone


def _archive_env(name: str, default=""):
    return os.getenv(name, default)


def _serialize_resident(profile):
    user = getattr(profile, "user", None)
    return {
        "user_id": getattr(user, "id", None),
        "username": getattr(user, "username", ""),
        "email": getattr(user, "email", ""),
        "first_name": getattr(user, "first_name", ""),
        "last_name": getattr(user, "last_name", ""),
        "barangay_id": str(profile.barangay_id),
        "address": profile.address,
        "birthdate": profile.birthdate.isoformat() if profile.birthdate else None,
        "phone_number": profile.phone_number,
        "date_registered": profile.date_registered.isoformat() if profile.date_registered else None,
        "expiry_date": profile.expiry_date.isoformat() if profile.expiry_date else None,
        "gender": profile.gender,
        "resident_category": profile.resident_category,
        "voter_status": profile.voter_status,
        "is_verified": profile.is_verified,
        "verified_at": profile.verified_at.isoformat() if profile.verified_at else None,
        "has_profile_photo": bool(profile.photo),
        "has_qr_code": bool(profile.qr_code),
        "has_face_enrollment": bool(profile.face_image or profile.face_embedding),
        "biometric_data_archived": False,
        "archive_status_before": profile.archive_status,
        "archived_at": timezone.now().isoformat(),
    }


def archive_resident_profile(profile, archived_by):
    snapshot = _serialize_resident(profile)
    payload_text = json.dumps(snapshot, sort_keys=True, indent=2)
    checksum = hashlib.sha256(payload_text.encode("utf-8")).hexdigest()
    timestamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
    key_prefix = (_archive_env("RESIDENT_ARCHIVE_KEY_PREFIX", "resident_profiles") or "resident_profiles").strip("/")
    key = f"{key_prefix}/{timezone.now().year}/{profile.user_id}-{timestamp}.json"
    backend = (_archive_env("RESIDENT_ARCHIVE_STORAGE_BACKEND", "local") or "local").lower()

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
            os.environ["ARCHIVE_S3_BUCKET"] = _archive_env("RESIDENT_ARCHIVE_S3_BUCKET")
            os.environ["ARCHIVE_S3_REGION"] = _archive_env("RESIDENT_ARCHIVE_S3_REGION")
            os.environ["ARCHIVE_S3_ENDPOINT_URL"] = _archive_env("RESIDENT_ARCHIVE_S3_ENDPOINT_URL")
            os.environ["ARCHIVE_S3_STORAGE_CLASS"] = _archive_env("RESIDENT_ARCHIVE_S3_STORAGE_CLASS", "STANDARD")
            os.environ["ARCHIVE_S3_SSE"] = _archive_env("RESIDENT_ARCHIVE_S3_SSE", "AES256")
            os.environ["ARCHIVE_S3_KMS_KEY_ID"] = _archive_env("RESIDENT_ARCHIVE_S3_KMS_KEY_ID")
            os.environ["ARCHIVE_S3_TAGS"] = _archive_env(
                "RESIDENT_ARCHIVE_S3_TAGS",
                "archive_kind=resident_profile,project=egate,barangay=663-a",
            )
            os.environ["ARCHIVE_OBJECT_KIND"] = "resident_profile"
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
    profile.archived_at = now
    profile.archived_by = archived_by
    profile.archive_status = "archived"
    profile.archive_storage = storage_name
    profile.archive_key = storage_key
    profile.archive_checksum = checksum
    profile.archive_error = ""
    profile.archived_snapshot = snapshot
    profile.save(
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
    return profile


def _restore_env(name, value):
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value
