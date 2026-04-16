from typing import Callable, Dict, Any
from datetime import datetime
from django.db import transaction
from django.utils import timezone
from events.models import Event, EventAttendance, EventRegistration, EntryLog
from residents.models import VerificationRequest, User
from .models import OutboxEvent, ConflictLog


# Handlers receive (payload, idempotency_key)
def handle_event_upserted(payload: Dict[str, Any], key: str):
    event_id = payload.get("id")
    if event_id is None:
        return
    defaults = {
        "title": payload.get("title", ""),
        "description": payload.get("description", ""),
        "event_type": payload.get("event_type", "community_events"),
        "date": payload.get("date"),
        "capacity": payload.get("capacity"),
        "registration_open": payload.get("registration_open"),
        "registration_close": payload.get("registration_close"),
        "venue": payload.get("venue", ""),
        "status": payload.get("status", "upcoming"),
        "created_by_id": payload.get("created_by_id"),
    }
    obj, created = Event.objects.update_or_create(id=event_id, defaults=defaults)
    if not created and "updated_at" in payload:
        # last-write-wins by updated_at
        try:
            incoming = timezone.make_aware(datetime.fromisoformat(payload["updated_at"]))
            if obj.updated_at and obj.updated_at > incoming:
                ConflictLog.objects.create(
                    event_type="event.upserted",
                    aggregate="events.Event",
                    aggregate_id=str(event_id),
                    incoming_updated_at=incoming,
                    local_updated_at=obj.updated_at,
                    details={"idempotency_key": key},
                )
        except Exception:
            # swallow parse errors
            pass


def handle_registration_changed(payload: Dict[str, Any], key: str):
    event_id = payload.get("event_id")
    resident_id = payload.get("resident_id")
    if not (event_id and resident_id):
        return
    if payload.get("action") == "cancel":
        EventRegistration.objects.filter(event_id=event_id, resident_id=resident_id).delete()
        return
    EventRegistration.objects.get_or_create(event_id=event_id, resident_id=resident_id)


def _create_entry_log(payload: Dict[str, Any]):
    EntryLog.objects.get_or_create(
        event_id=payload.get("event_id"),
        user_id=payload.get("user_id"),
        method=payload.get("method", "qr"),
        status=payload.get("status", "allowed"),
        defaults={
            "confidence": payload.get("confidence"),
            "created_by_id": payload.get("created_by_id"),
            "raw_payload": payload.get("raw_payload"),
        },
    )


def handle_attendance_marked(payload: Dict[str, Any], key: str):
    reg_id = payload.get("registration_id")
    if not reg_id:
        return
    reg = EventRegistration.objects.filter(id=reg_id).first()
    if not reg:
        return
    EventAttendance.objects.get_or_create(
        registration=reg,
        defaults={"verified_by_id": payload.get("verified_by_id")},
    )
    _create_entry_log(payload)


def handle_entrylog_created(payload: Dict[str, Any], key: str):
    _create_entry_log(payload)


def handle_verification_changed(payload: Dict[str, Any], key: str):
    vr_id = payload.get("verification_id")
    status = payload.get("status")
    if not (vr_id and status):
        return
    vr = VerificationRequest.objects.filter(id=vr_id).first()
    if not vr:
        return
    vr.status = status
    vr.admin_note = payload.get("admin_note", vr.admin_note)
    vr.reviewed_by_id = payload.get("reviewed_by_id")
    vr.reviewed_at = payload.get("reviewed_at")
    vr.save(update_fields=["status", "admin_note", "reviewed_by", "reviewed_at"])
    prof = getattr(vr.user, "profile", None)
    if prof:
        prof.is_verified = status == VerificationRequest.Status.APPROVED
        prof.verified_at = vr.reviewed_at if prof.is_verified else None
        prof.save(update_fields=["is_verified", "verified_at"])


HANDLERS: Dict[str, Callable[[Dict[str, Any], str], None]] = {
    "event.upserted": handle_event_upserted,
    "registration.changed": handle_registration_changed,
    "attendance.marked": handle_attendance_marked,
    "entrylog.created": handle_entrylog_created,
    "verification.changed": handle_verification_changed,
}


def apply_event(event_type: str, payload: Dict[str, Any], idempotency_key: str):
    """
    Apply a pulled event locally in an idempotent manner.
    """
    # Record or skip if already applied locally (by idempotency_key uniqueness)
    created = False
    try:
        OutboxEvent.objects.get_or_create(
            idempotency_key=idempotency_key,
            defaults={
                "event_type": event_type,
                "aggregate": payload.get("aggregate", ""),
                "aggregate_id": str(payload.get("aggregate_id", "")),
                "payload": payload,
                "source_node_id": payload.get("source_node_id", "remote"),
                "sent_at": timezone.now(),
            },
        )
        created = True
    except Exception:
        pass
    if not created:
        return  # already applied

    handler = HANDLERS.get(event_type)
    if handler:
        try:
            with transaction.atomic():
                handler(payload, idempotency_key)
        except Exception as exc:
            ConflictLog.objects.create(
                event_type=event_type,
                aggregate=payload.get("aggregate", ""),
                aggregate_id=str(payload.get("aggregate_id", "")),
                details={"error": str(exc), "idempotency_key": idempotency_key},
            )
