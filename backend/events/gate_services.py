import os

from PIL import Image
from django.db import transaction
from django.utils import timezone

from accounts.face_utils import (
    FaceLibNotAvailable,
    extract_embedding,
    get_image_match_threshold,
    match_embedding,
    match_face_image,
)
from residents.models import ResidentProfile

from .models import EntryLog


def resolve_resident_profile(*, barangay_id=None, username=None):
    qs = ResidentProfile.objects.select_related("user").filter(user__is_resident=True)
    if barangay_id:
        return qs.filter(barangay_id=barangay_id).first()
    if username:
        return qs.filter(user__username=username).first()
    return None


def validate_resident_gate_profile(profile):
    if profile is None:
        return "Resident profile not found.", "not_found", 404
    if profile.archived_at:
        return "Resident account is archived.", "resident_archived", 403
    if profile.deactivated_at:
        return "Resident account is deactivated.", "resident_deactivated", 403
    if not profile.is_verified:
        return "Resident is not verified.", "not_verified", 403
    if profile.expiry_date and profile.expiry_date < timezone.localdate():
        return "Resident ID is expired.", "expired_id", 403
    return None, None, None


def get_latest_resident_log(user):
    return (
        EntryLog.objects.filter(user=user, event__isnull=True, status="allowed")
        .order_by("-created_at", "-id")
        .first()
    )


def get_next_resident_direction(user):
    latest_log = get_latest_resident_log(user)
    if latest_log and latest_log.direction == "time_in":
        return "time_out"
    return "time_in"


def resolve_resident_direction(user, requested_direction=None):
    latest_log = get_latest_resident_log(user)
    normalized = (requested_direction or "").strip().lower()

    if not normalized or normalized == "auto":
        return get_next_resident_direction(user), None, None

    if normalized not in {"time_in", "time_out"}:
        return None, "Direction must be time_in or time_out.", "invalid_direction"

    if normalized == "time_in" and latest_log and latest_log.direction == "time_in":
        return None, "Resident is already timed in.", "already_timed_in"

    if normalized == "time_out":
        if latest_log is None:
            return None, "Resident has no recorded time in yet.", "not_checked_in"
        if latest_log.direction == "time_out":
            return None, "Resident is already timed out.", "already_timed_out"

    return normalized, None, None


def build_resident_log_payload(entry):
    profile = getattr(entry.user, "profile", None) if entry.user_id else None
    address = getattr(profile, "address", None) if profile else None
    zone = None
    if address:
        parts = [part.strip() for part in address.split(",") if part.strip()]
        zone = parts[-1] if parts else address
    return {
        "id": entry.id,
        "username": getattr(entry.user, "username", None),
        "barangay_id": str(getattr(profile, "barangay_id", "")) if profile else None,
        "direction": entry.direction,
        "method": entry.method,
        "status": entry.status,
        "confidence": entry.confidence,
        "created_at": entry.created_at,
        "recorded_by": getattr(entry.created_by, "username", None),
        "resident_address": address,
        "resident_zone": zone,
        "resident_verified": bool(getattr(profile, "is_verified", False)) if profile else False,
        "resident_expiry_date": profile.expiry_date if profile and profile.expiry_date else None,
    }


def record_resident_gate_log(profile, *, actor=None, method="qr", confidence=None, raw_payload=None, requested_direction=None):
    # Resident time logs are stored separately from event attendance by keeping event=NULL.
    direction, error, result_code = resolve_resident_direction(profile.user, requested_direction=requested_direction)
    if error:
        return None, error, result_code

    with transaction.atomic():
        entry = EntryLog.objects.create(
            user=profile.user,
            event=None,
            direction=direction,
            method=method,
            status="allowed",
            created_by=actor,
            confidence=confidence,
            raw_payload=raw_payload or {},
        )
    return entry, None, None


def validate_face_upload(image):
    if not image:
        return "Provide a face image under field 'image'."
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if getattr(image, "content_type", None) not in allowed_types:
        return "Unsupported image type. Use JPG, PNG, or WEBP."
    if getattr(image, "size", None) and image.size > 5 * 1024 * 1024:
        return "File too large. Max 5MB."
    try:
        img = Image.open(image)
        img.verify()
        try:
            image.seek(0)
        except Exception:
            pass
    except Exception as exc:
        return f"Invalid image: {exc}"
    return None


def parse_tolerance(raw_tolerance):
    try:
        tolerance = float(raw_tolerance) if raw_tolerance is not None else float(os.getenv("FACE_TOLERANCE", "0.5"))
    except Exception:
        tolerance = float(os.getenv("FACE_TOLERANCE", "0.5"))
    return max(0.35, min(0.6, tolerance))


def match_verified_resident_by_face(image, *, tolerance=None, fallback_username=None):
    verified_profiles = list(
        ResidentProfile.objects.select_related("user")
        .filter(user__is_resident=True, is_verified=True, archived_at__isnull=True, deactivated_at__isnull=True)
    )
    if fallback_username:
        fallback = next((profile for profile in verified_profiles if profile.user.username == fallback_username), None)
        if fallback is not None:
            error, code, status_code = validate_resident_gate_profile(fallback)
            if not error:
                return fallback, None, None

    try:
        probe_embedding = extract_embedding(image)
    except FaceLibNotAvailable:
        image_candidates = []
        for profile in verified_profiles:
            face_image = getattr(profile, "face_image", None)
            image_path = getattr(face_image, "path", None) if face_image else None
            if image_path and os.path.exists(image_path):
                image_candidates.append((profile.user_id, image_path))
        fallback_threshold = get_image_match_threshold(len(image_candidates))
        matched_user_id, score = match_face_image(image, image_candidates, threshold=fallback_threshold)
        profile = next((item for item in verified_profiles if item.user_id == matched_user_id), None)
        return profile, score, None
    except ValueError as exc:
        return None, None, str(exc)

    candidates = []
    for profile in verified_profiles:
        if profile.face_embedding:
            candidates.append((profile.user_id, profile.face_embedding))
    matched_user_id, score = match_embedding(probe_embedding, candidates, tolerance=tolerance or parse_tolerance(None))
    profile = next((item for item in verified_profiles if item.user_id == matched_user_id), None)
    return profile, score, None
