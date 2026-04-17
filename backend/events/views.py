from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.views import APIView
from .models import Event, EventRegistration, EventAttendance, EntryLog
from .serializers import (
    EventSerializer,
    EventRegistrationSerializer,
    EventAttendanceSerializer,
    EntryLogSerializer,
    ResidentGateLogSerializer,
    normalize_audience_type,
)
from accounts.permissions import IsAdminUserRole, IsResidentUserRole, IsAdminOrGateOperatorRole, IsGateAccessAllowed
from django.db.models import Q, Count
from django.db.models.functions import TruncDate
from django.utils.dateparse import parse_datetime, parse_date
from django.http import HttpResponse
from datetime import datetime, time as dtime
import os
import csv
from residents.models import ResidentProfile
from accounts.face_utils import (
    FaceLibNotAvailable,
    detect_face_count,
    extract_embedding,
    get_image_match_threshold,
    match_embedding,
    match_face_image,
)
from PIL import Image
from django.db import transaction, IntegrityError
import logging
from sync.outbox import emit as emit_outbox
from .gate_services import (
    match_verified_resident_by_face,
    parse_tolerance,
    record_resident_gate_log,
    resolve_resident_profile,
    validate_face_upload,
    validate_resident_gate_profile,
)
from common.audit import audit_log
from .archive import archive_event

logger = logging.getLogger("events")
KIDS_MAX_AGE = 17
ADULT_MIN_AGE = 18
ADULT_MAX_AGE = 59
SENIOR_MIN_AGE = 60


def _calculate_age(birthdate, today=None):
    if not birthdate:
        return None
    today = today or timezone.localdate()
    return today.year - birthdate.year - (
        (today.month, today.day) < (birthdate.month, birthdate.day)
    )


def _validate_event_audience(event, profile):
    audience = normalize_audience_type(getattr(event, "audience_type", "all") or "all")
    if audience == "all":
        return None

    audiences = set(audience.split(","))

    age = _calculate_age(getattr(profile, "birthdate", None))
    if age is None:
        return Response(
            {"error": "Resident birthdate is required for this event.", "result_code": "birthdate_required"},
            status=status.HTTP_403_FORBIDDEN,
        )
    if "kids_only" in audiences and age <= KIDS_MAX_AGE:
        return None
    if "adult_only" in audiences and ADULT_MIN_AGE <= age <= ADULT_MAX_AGE:
        return None
    if "senior_only" in audiences and age >= SENIOR_MIN_AGE:
        return None
    if audiences == {"kids_only"} and age > KIDS_MAX_AGE:
        return Response(
            {"error": "This event is for kids/teens only.", "result_code": "audience_kids_only"},
            status=status.HTTP_403_FORBIDDEN,
        )
    if audiences == {"adult_only"} and not (ADULT_MIN_AGE <= age <= ADULT_MAX_AGE):
        return Response(
            {"error": "This event is for adult residents only.", "result_code": "audience_adult_only"},
            status=status.HTTP_403_FORBIDDEN,
        )
    if audiences == {"senior_only"} and age < SENIOR_MIN_AGE:
        return Response(
            {"error": "This event is for senior residents only.", "result_code": "audience_senior_only"},
            status=status.HTTP_403_FORBIDDEN,
        )
    return Response(
        {"error": "This event is only for selected age-based audiences.", "result_code": "audience_restricted"},
        status=status.HTTP_403_FORBIDDEN,
    )


def _emit(event_type: str, aggregate: str, aggregate_id, payload):
    try:
        emit_outbox(event_type, aggregate, aggregate_id, payload)
    except Exception as e:
        logger.info(f"[SYNC_EMIT_SKIP] {event_type} err={e}")


def _actor_user_or_none(request):
    user = getattr(request, "user", None)
    return user if getattr(user, "is_authenticated", False) else None


def _resolve_registration_from_request(request):
    registration_id = request.data.get("registration_id")
    barangay_id = request.data.get("barangay_id")
    username = request.data.get("username")
    event_id = request.data.get("event_id")

    registration = None
    if registration_id:
        registration = EventRegistration.objects.filter(id=registration_id).first()
    elif barangay_id and event_id:
        registration = EventRegistration.objects.filter(
            resident__profile__barangay_id=barangay_id,
            event_id=event_id,
        ).first()
    elif username and event_id:
        registration = EventRegistration.objects.filter(
            resident__username=username,
            event_id=event_id,
        ).first()
    else:
        return None, Response(
            {"error": "Provide event_id and barangay_id or username."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not registration:
        return None, Response({"error": "Registration not found."}, status=status.HTTP_404_NOT_FOUND)
    if getattr(registration.event, "archived_at", None):
        return None, Response({"error": "Event is archived.", "result_code": "event_archived"}, status=status.HTTP_400_BAD_REQUEST)
    return registration, None


def _validate_registration_profile(registration):
    profile = getattr(registration.resident, "profile", None)
    if profile is None:
        return None, Response({"error": "Resident profile not found.", "result_code": "resident_profile_missing"}, status=status.HTTP_400_BAD_REQUEST)
    if not getattr(profile, "is_verified", False):
        return None, Response({"error": "Resident is not verified.", "result_code": "not_verified"}, status=status.HTTP_403_FORBIDDEN)
    if getattr(profile, "expiry_date", None) and profile.expiry_date < timezone.localdate():
        return None, Response({"error": "Resident ID is expired.", "result_code": "expired_id"}, status=status.HTTP_403_FORBIDDEN)
    return profile, None


def _entry_log_payload(registration, actor, method, direction, timestamp, confidence=None):
    profile = getattr(registration.resident, "profile", None)
    address = getattr(profile, "address", None) if profile else None
    zone = None
    if address:
        parts = [part.strip() for part in address.split(",") if part.strip()]
        zone = parts[-1] if parts else address
    return {
        "event_id": registration.event_id,
        "event_title": registration.event.title,
        "event_capacity": registration.event.capacity,
        "event_registrations_count": registration.event.registrations.count(),
        "resident_username": registration.resident.username,
        "barangay_id": str(getattr(profile, "barangay_id", "")) if profile else None,
        "resident_address": address,
        "resident_zone": zone,
        "resident_verified": bool(getattr(profile, "is_verified", False)) if profile else False,
        "resident_birthdate": profile.birthdate.isoformat() if profile and getattr(profile, "birthdate", None) else None,
        "resident_expiry_date": profile.expiry_date.isoformat() if profile and getattr(profile, "expiry_date", None) else None,
        "resident_photo": None,
        "resident_face_image": None,
        "verified_by": getattr(actor, "username", None),
        "checked_in_at": timestamp.isoformat() if timestamp else None,
        "direction": direction,
        "method": method,
        "match_distance": confidence,
    }


def _create_entry_log(registration, actor, method, direction, confidence=None, raw_payload=None):
    return EntryLog.objects.create(
        user=registration.resident,
        event=registration.event,
        direction=direction,
        method=method,
        status="allowed",
        created_by=actor,
        confidence=confidence,
        raw_payload=raw_payload,
    )


def _attendance_verifier_label(attendance):
    if attendance.verified_by:
        return attendance.verified_by.username
    try:
        has_gate_log = EntryLog.objects.filter(
            user=attendance.registration.resident,
            event=attendance.registration.event,
            direction="time_in",
            status="allowed",
        ).exists()
    except Exception:
        has_gate_log = False
    return "Gate Operator" if has_gate_log else ""


def _get_latest_allowed_entry_log(registration):
    return (
        EntryLog.objects.filter(
            user=registration.resident,
            event=registration.event,
            status="allowed",
        )
        .order_by("-created_at", "-id")
        .first()
    )


def _record_time_out(registration, actor, request, method, raw_payload=None, confidence=None):
    _, error_response = _validate_registration_profile(registration)
    if error_response:
        return error_response

    latest_log = _get_latest_allowed_entry_log(registration)
    if latest_log is None:
        return Response(
            {
                "error": "Resident has no recorded time in for this event yet.",
                "result_code": "not_checked_in",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if latest_log.direction == "time_out":
        return Response(
            {
                "error": "Resident is already timed out for this event.",
                "result_code": "already_timed_out",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    entry = _create_entry_log(
        registration,
        actor,
        method=method,
        direction="time_out",
        confidence=confidence,
        raw_payload=raw_payload,
    )
    payload = _entry_log_payload(
        registration,
        actor,
        method=method,
        direction="time_out",
        timestamp=entry.created_at,
        confidence=confidence,
    )
    _emit(
        "entrylog.created",
        "events.EntryLog",
        f"{registration.id}-{method}-time_out-{entry.id}",
        {
            "event_id": registration.event_id,
            "user_id": registration.resident_id,
            "method": method,
            "direction": "time_out",
            "status": "allowed",
            "created_by_id": getattr(actor, "id", None),
            "confidence": confidence,
            "raw_payload": raw_payload or {},
        },
    )
    audit_log(
        request,
        actor=actor,
        action="attendance_mark",
        target_type="event_attendance",
        target_id=registration.id,
        target_label=registration.resident.username,
        metadata={
            "event_id": registration.event_id,
            "resident_user_id": registration.resident_id,
            "resident_name": registration.resident.username,
            "direction": "time_out",
            "method": method,
            "confidence": confidence,
        },
    )
    return Response({**payload, "message": "Time out recorded.", "result_code": "time_out"}, status=status.HTTP_201_CREATED)


def _resident_gate_error_response(message, result_code, status_code):
    return Response({"error": message, "result_code": result_code}, status=status_code)


def _serialize_resident_gate_entry(entry, request, *, message, result_code):
    serializer = ResidentGateLogSerializer(entry, context={"request": request})
    return Response({**serializer.data, "message": message, "result_code": result_code}, status=status.HTTP_201_CREATED)


def _record_resident_gate_entry(profile, request, *, method, confidence=None, raw_payload=None, actor=None):
    error, result_code, status_code = validate_resident_gate_profile(profile)
    if error:
        return _resident_gate_error_response(error, result_code, status_code)

    requested_direction = request.data.get("direction") or request.query_params.get("direction")
    entry, direction_error, direction_result_code = record_resident_gate_log(
        profile,
        actor=actor,
        method=method,
        confidence=confidence,
        raw_payload=raw_payload,
        requested_direction=requested_direction,
    )
    if direction_error:
        return _resident_gate_error_response(direction_error, direction_result_code, status.HTTP_400_BAD_REQUEST)
    direction_label = "Time in" if entry.direction == "time_in" else "Time out"
    _emit(
        "entrylog.created",
        "events.EntryLog",
        entry.id,
        {
            "event_id": None,
            "user_id": profile.user_id,
            "method": method,
            "direction": entry.direction,
            "status": "allowed",
            "created_by_id": getattr(actor, "id", None),
            "confidence": confidence,
            "raw_payload": raw_payload or {},
        },
    )
    audit_log(
        request,
        actor=actor,
        action="attendance_mark",
        target_type="resident_gate_log",
        target_id=entry.id,
        target_label=profile.user.username,
        metadata={
            "direction": entry.direction,
            "method": method,
            "confidence": confidence,
            "mode": "resident_gate",
            "resident_user_id": profile.user_id,
            "resident_name": profile.user.username,
        },
    )
    return _serialize_resident_gate_entry(
        entry,
        request,
        message=f"{direction_label} recorded for resident gate log.",
        result_code=entry.direction,
    )


#Create Event (Admin Only)
@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def create_event(request):
    """Only admins can create events; created_by is set automatically."""
    user = request.user

    serializer = EventSerializer(data=request.data)
    if serializer.is_valid():
        event = serializer.save(created_by=user)  # ✅ auto attach admin
        _emit(
            "event.upserted",
            "events.Event",
            event.id,
            {**serializer.data, "id": event.id, "created_by_id": getattr(user, "id", None)},
        )
        return Response(EventSerializer(event).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# List Events (delegate to CBV for single source of truth)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_events(request):
    # Import locally to avoid forward reference warning in static analysis tools
    from .views import EventListView as _EventListView
    return _EventListView.as_view()(request)


# View Single Event (delegate to CBV for consistency)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def event_detail(request, event_id):
    # Import locally to avoid forward reference warning in static analysis tools
    from .views import EventDetailView as _EventDetailView
    # Pass the correct URL kwarg expected by EventDetailView
    return _EventDetailView.as_view()(request, event_id=event_id)


#Update Event (Admin only)
@api_view(['PUT'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def update_event(request, event_id):

    try:
        event = Event.objects.select_related('created_by').get(id=event_id)
    except Event.DoesNotExist:
        return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)
    if event.archived_at:
        return Response({"error": "Archived events cannot be edited until restored."}, status=status.HTTP_400_BAD_REQUEST)

    serializer = EventSerializer(event, data=request.data, partial=True)
    if serializer.is_valid():
        updated = serializer.save()
        _emit(
            "event.upserted",
            "events.Event",
            updated.id,
            {**serializer.data, "id": updated.id, "updated_at": timezone.now().isoformat()},
        )
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


#Delete Event (Admin only)
@api_view(['DELETE'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def delete_event(request, event_id):

    try:
        event = Event.objects.select_related('created_by').get(id=event_id)
        if event.archived_at:
            return Response({"error": "Archived events cannot be deleted until restored."}, status=status.HTTP_400_BAD_REQUEST)
        event.delete()
        return Response({"message": "Event deleted successfully"}, status=status.HTTP_200_OK)
    except Event.DoesNotExist:
        return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)


def _event_can_be_archived(event):
    now = timezone.now()
    if event.status in {"completed", "cancelled"}:
        return True
    if event.end_date and event.end_date <= now:
        return True
    if not event.end_date and event.date <= now:
        return True
    return False


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def archive_event_view(request, event_id):
    try:
        event = (
            Event.objects.select_related('created_by')
            .prefetch_related(
                'registrations',
                'registrations__resident',
                'registrations__resident__profile',
                'registrations__attendance',
                'registrations__attendance__verified_by',
                'entry_logs',
                'entry_logs__user',
                'entry_logs__created_by',
            )
            .get(id=event_id)
        )
    except Event.DoesNotExist:
        return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

    if event.archived_at:
        serializer = EventSerializer(event)
        return Response({**serializer.data, "message": "Event already archived."}, status=status.HTTP_200_OK)
    if not _event_can_be_archived(event):
        return Response({"error": "Only ended, completed, or cancelled events can be archived."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        event = archive_event(event, request.user)
    except Exception as exc:
        event.archive_status = "failed"
        event.archive_error = str(exc)
        event.save(update_fields=["archive_status", "archive_error"])
        return Response({"error": f"Archive failed: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    audit_log(
        request,
        actor=request.user,
        action="event_archive",
        target_type="event",
        target_id=event.id,
        target_label=event.title,
        metadata={
            "event_id": event.id,
            "event_title": event.title,
            "archive_storage": event.archive_storage,
            "archive_key": event.archive_key,
        },
    )
    return Response({**EventSerializer(event).data, "message": "Event archived."}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def unarchive_event_view(request, event_id):
    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

    if not event.archived_at:
        serializer = EventSerializer(event)
        return Response({**serializer.data, "message": "Event is already active."}, status=status.HTTP_200_OK)

    event.archived_at = None
    event.archived_by = None
    event.archive_status = "active"
    event.archive_error = ""
    event.save(update_fields=["archived_at", "archived_by", "archive_status", "archive_error", "updated_at"])
    return Response({**EventSerializer(event).data, "message": "Event restored."}, status=status.HTTP_200_OK)

# 🧑‍🤝‍🧑 Register for event (Resident)
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsResidentUserRole])
def register_for_event(request, event_id):
    user = request.user

    try:
        event = Event.objects.select_related('created_by').get(id=event_id)
    except Event.DoesNotExist:
        return Response({"error": "Event not found."}, status=status.HTTP_404_NOT_FOUND)
    if event.archived_at:
        return Response({"error": "Event is archived.", "result_code": "event_archived"}, status=status.HTTP_400_BAD_REQUEST)

    profile = getattr(user, "profile", None)
    if profile is None:
        return Response({"error": "Resident profile not found."}, status=status.HTTP_400_BAD_REQUEST)
    if not getattr(profile, "is_verified", False):
        return Response(
            {
                "error": "Verify your resident account before registering for events.",
                "result_code": "not_verified",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    audience_error = _validate_event_audience(event, profile)
    if audience_error:
        return audience_error

    # Registration window and capacity checks
    now = timezone.now()
    if event.registration_open and now < event.registration_open:
        return Response({"error": "Registration not yet open."}, status=status.HTTP_403_FORBIDDEN)
    if event.registration_close and now > event.registration_close:
        return Response({"error": "Registration closed."}, status=status.HTTP_403_FORBIDDEN)
    if event.capacity is not None:
        current = EventRegistration.objects.filter(event=event).count()
        if current >= event.capacity:
            return Response({"error": "Event is at full capacity."}, status=status.HTTP_403_FORBIDDEN)

    # Enforce capacity under concurrency
    try:
        with transaction.atomic():
            evt = Event.objects.select_for_update().get(id=event.id)
            if evt.capacity is not None:
                current = EventRegistration.objects.filter(event=evt).count()
                if current >= evt.capacity:
                    return Response({"error": "Event is at full capacity."}, status=status.HTTP_403_FORBIDDEN)
            registration, created = EventRegistration.objects.get_or_create(event=evt, resident=user)
            if not created:
                return Response({"message": "You are already registered for this event."}, status=status.HTTP_200_OK)
    except IntegrityError:
        return Response({"message": "You are already registered for this event."}, status=status.HTTP_200_OK)

    serializer = EventRegistrationSerializer(registration)
    _emit(
        "registration.changed",
        "events.EventRegistration",
        registration.id,
        {"action": "register", "event_id": event.id, "resident_id": user.id},
    )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# Unregister from event (Resident)
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsResidentUserRole])
def unregister_for_event(request, event_id):
    user = request.user
    try:
        event = Event.objects.select_related('created_by').get(id=event_id)
    except Event.DoesNotExist:
        return Response({"error": "Event not found."}, status=status.HTTP_404_NOT_FOUND)
    if event.archived_at:
        return Response({"error": "Event is archived.", "result_code": "event_archived"}, status=status.HTTP_400_BAD_REQUEST)

    # Prevent unregistering after attendance or after close
    now = timezone.now()
    if event.registration_close and now > event.registration_close:
        return Response({"error": "Registration closed; cannot unregister."}, status=status.HTTP_403_FORBIDDEN)

    registration = EventRegistration.objects.filter(event=event, resident=user).first()
    if not registration:
        return Response({"message": "You are not registered for this event."}, status=status.HTTP_200_OK)

    if hasattr(registration, 'attendance'):
        return Response({"error": "Already checked in; cannot unregister."}, status=status.HTTP_403_FORBIDDEN)

    reg_id = registration.id
    registration.delete()
    _emit(
        "registration.changed",
        "events.EventRegistration",
        reg_id,
        {"action": "cancel", "event_id": event.id, "resident_id": user.id},
    )
    return Response({"message": "Unregistered from event."}, status=status.HTTP_200_OK)


# 📋 View all my registered events (Resident)
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsResidentUserRole])
def my_registered_events(request):
    """
    Show all events where the logged-in resident is registered.
    """
    user = request.user

    # role check enforced by permission

    registrations = EventRegistration.objects.filter(resident=user).select_related('event')
    serializer = EventRegistrationSerializer(registrations, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


# Admin: View registrants for an event
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def view_event_registrants(request, event_id):
    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        return Response({"error": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

    registrations = (
        EventRegistration.objects
        .select_related('resident', 'resident__profile', 'event')
        .filter(event=event)
    )
    serializer = EventRegistrationSerializer(registrations, many=True)
    return Response(serializer.data)


# Admin: Mark attendance (via registration_id or barangay_id/username + event_id)
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminOrGateOperatorRole])
def mark_attendance(request):
    return _mark_attendance_impl(request, _actor_user_or_none(request))


def _mark_attendance_impl(request, user):
    direction = (request.data.get("direction") or "time_in").strip().lower()
    registration, error_response = _resolve_registration_from_request(request)
    if error_response:
        return error_response
    if direction == "time_out":
        return _record_time_out(
            registration,
            user,
            request,
            method="qr",
            raw_payload={
                "registration_id": request.data.get("registration_id"),
                "barangay_id": str(request.data.get("barangay_id")) if request.data.get("barangay_id") else None,
                "username": request.data.get("username"),
            },
        )

    profile, error_response = _validate_registration_profile(registration)
    if error_response:
        return error_response
    # Create attendance safely under concurrency
    try:
        with transaction.atomic():
            reg = EventRegistration.objects.select_for_update().get(id=registration.id)
            defaults = {"verified_by": user} if user else {}
            attendance, created = EventAttendance.objects.get_or_create(registration=reg, defaults=defaults)
            if not created:
                if user and attendance.verified_by_id is None:
                    attendance.verified_by = user
                    attendance.save(update_fields=["verified_by"])
                serializer = EventAttendanceSerializer(attendance, context={'request': request})
                return Response({**serializer.data, "message": "Resident already checked in.", "result_code": "duplicate"}, status=status.HTTP_200_OK)
            if not reg.attendance_confirmed:
                reg.attendance_confirmed = True
                reg.save(update_fields=["attendance_confirmed"])
    except IntegrityError:
        att = EventAttendance.objects.filter(registration=registration).first()
        serializer = EventAttendanceSerializer(att, context={'request': request}) if att else None
        return Response(
            {**(serializer.data if serializer else {}), "message": "Resident already checked in.", "result_code": "duplicate"},
            status=status.HTTP_200_OK,
        )

    logger.info(
        f"ATTENDANCE_MARKED event_id={registration.event_id} resident_id={registration.resident_id} verified_by={getattr(user, 'id', None)}"
    )
    try:
        _create_entry_log(
            registration,
            user,
            method="qr",
            direction="time_in",
            raw_payload={
                "registration_id": request.data.get("registration_id"),
                "barangay_id": str(request.data.get("barangay_id")) if request.data.get("barangay_id") else None,
                "username": request.data.get("username"),
            },
        )
    except Exception as e:
        logger.info(f"[ENTRYLOG_QR_FAIL] reg={registration.id} err={e}")
    serializer = EventAttendanceSerializer(attendance, context={'request': request})
    _emit(
        "attendance.marked",
        "events.EventAttendance",
        attendance.id,
        {
            "registration_id": registration.id,
            "event_id": registration.event_id,
            "user_id": registration.resident_id,
            "verified_by_id": getattr(user, "id", None),
            "method": "qr",
            "raw_payload": request.data,
        },
    )
    _emit(
        "entrylog.created",
        "events.EntryLog",
        f"{registration.id}-qr",
        {
            "event_id": registration.event_id,
            "user_id": registration.resident_id,
            "method": "qr",
            "status": "allowed",
            "created_by_id": getattr(user, "id", None),
            "raw_payload": request.data,
        },
    )
    audit_log(
        request,
        actor=user,
        action="attendance_mark",
        target_type="event_attendance",
        target_id=attendance.id,
        target_label=registration.resident.username,
        metadata={
            "event_id": registration.event_id,
            "resident_user_id": registration.resident_id,
            "resident_name": registration.resident.username,
            "direction": "time_in",
            "method": "qr",
        },
    )
    return Response({**serializer.data, "result_code": "success"}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsGateAccessAllowed])
def gate_mark_attendance(request):
    return _mark_attendance_impl(request, _actor_user_or_none(request))


@api_view(["POST"])
@permission_classes([IsGateAccessAllowed])
def gate_mark_resident_log(request):
    profile = resolve_resident_profile(
        barangay_id=request.data.get("barangay_id"),
        username=request.data.get("username"),
    )
    if profile is None:
        return _resident_gate_error_response(
            "Resident profile not found.",
            "not_found",
            status.HTTP_404_NOT_FOUND,
        )
    actor = _actor_user_or_none(request)
    return _record_resident_gate_entry(
        profile,
        request,
        method="qr",
        actor=actor,
        raw_payload={
            "barangay_id": str(request.data.get("barangay_id")) if request.data.get("barangay_id") else None,
            "username": request.data.get("username"),
            "direction": request.data.get("direction"),
            "mode": "resident_log",
        },
    )


@api_view(["POST"])
@permission_classes([IsGateAccessAllowed])
def gate_mark_resident_log_face(request):
    image = request.FILES.get("image") or request.FILES.get("face") or request.FILES.get("face_image")
    error = validate_face_upload(image)
    if error:
        return _resident_gate_error_response(error, "invalid_image", status.HTTP_400_BAD_REQUEST)

    tolerance = parse_tolerance(request.data.get("tolerance") or request.query_params.get("tolerance"))
    fallback_username = request.data.get("username") or request.query_params.get("username")
    profile, score, match_error = match_verified_resident_by_face(
        image,
        tolerance=tolerance,
        fallback_username=fallback_username,
    )
    if match_error:
        return _resident_gate_error_response(match_error, "invalid_face", status.HTTP_400_BAD_REQUEST)
    if profile is None:
        return _resident_gate_error_response(
            "No matching verified resident found.",
            "not_found",
            status.HTTP_404_NOT_FOUND,
        )
    actor = _actor_user_or_none(request)
    return _record_resident_gate_entry(
        profile,
        request,
        method="face",
        confidence=score,
        actor=actor,
        raw_payload={
            "mode": "resident_log",
            "direction": request.data.get("direction") or request.query_params.get("direction"),
            "tolerance": tolerance,
            "match_distance": score,
            "fallback_username": fallback_username or None,
        },
    )


# Admin: Mark attendance via face match (upload an image and event_id)
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminOrGateOperatorRole])
def detect_face_presence(request):
    return _detect_face_presence_impl(request)


@api_view(['POST'])
@permission_classes([IsGateAccessAllowed])
def gate_detect_face_presence(request):
    return _detect_face_presence_impl(request)


def _detect_face_presence_impl(request):
    image = request.FILES.get('image') or request.FILES.get('face') or request.FILES.get('face_image')
    if not image:
        return Response({"error": "Provide a face image under field 'image'."}, status=status.HTTP_400_BAD_REQUEST)

    allowed_types = {'image/jpeg', 'image/png', 'image/webp'}
    if getattr(image, 'content_type', None) not in allowed_types:
        return Response({"error": "Unsupported image type. Use JPG, PNG, or WEBP."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        faces_count = detect_face_count(image)
        return Response(
            {
                "faces_detected": faces_count,
                "has_single_face": faces_count == 1,
            },
            status=status.HTTP_200_OK,
        )
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except FaceLibNotAvailable:
        return Response({"faces_detected": 0, "has_single_face": False}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": f"Failed to detect face: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


# Admin: Mark attendance via face match (upload an image and event_id)
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminOrGateOperatorRole])
def mark_attendance_face(request):
    return _mark_attendance_face_impl(request, _actor_user_or_none(request))


@api_view(['POST'])
@permission_classes([IsGateAccessAllowed])
def gate_mark_attendance_face(request):
    return _mark_attendance_face_impl(request, _actor_user_or_none(request))


def _mark_attendance_face_impl(request, user):
    event_id = request.data.get('event_id')
    image = request.FILES.get('image') or request.FILES.get('face') or request.FILES.get('face_image')
    fallback_username = request.data.get('username') or request.query_params.get('username')
    tol_param = request.data.get('tolerance') or request.query_params.get('tolerance')
    direction = (request.data.get("direction") or request.query_params.get("direction") or "time_in").strip().lower()
    if not event_id or not image:
        return Response({"error": "Provide event_id and a face image under field 'image'."}, status=status.HTTP_400_BAD_REQUEST)

    # Basic image validation (content type, size, decodability)
    allowed_types = {'image/jpeg', 'image/png', 'image/webp'}
    if getattr(image, 'content_type', None) not in allowed_types:
        return Response({"error": "Unsupported image type. Use JPG, PNG, or WEBP."}, status=status.HTTP_400_BAD_REQUEST)
    if getattr(image, 'size', None) and image.size > 5 * 1024 * 1024:
        return Response({"error": "File too large. Max 5MB."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        img = Image.open(image)
        img.verify()  # verify without decoding full image
        try:
            image.seek(0)
        except Exception:
            pass
    except Exception as e:
        return Response({"error": f"Invalid image: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

    regs = (
        EventRegistration.objects.select_related('resident', 'resident__profile')
        .filter(event=event, resident__profile__isnull=False)
    )

    try:
        tol = float(tol_param) if tol_param is not None else float(os.getenv('FACE_TOLERANCE', '0.5'))
    except Exception:
        tol = float(os.getenv('FACE_TOLERANCE', '0.5'))
    tol = max(0.35, min(0.6, tol))

    try:
        probe_emb = extract_embedding(image)
    except FaceLibNotAvailable:
        image_candidates = []
        verified_image_candidates = []
        for reg in regs:
            prof = getattr(reg.resident, 'profile', None)
            face_image = getattr(prof, 'face_image', None)
            image_path = getattr(face_image, 'path', None) if face_image else None
            if image_path and os.path.exists(image_path):
                image_candidates.append((reg.resident_id, image_path))
                if getattr(prof, 'is_verified', False) and not (
                    getattr(prof, 'expiry_date', None) and prof.expiry_date < timezone.localdate()
                ):
                    verified_image_candidates.append((reg.resident_id, image_path))

        matched_user_id = None
        dist = None
        primary_candidates = verified_image_candidates or image_candidates
        if primary_candidates:
            fallback_threshold = get_image_match_threshold(len(primary_candidates))
            try:
                matched_user_id, dist = match_face_image(image, primary_candidates, threshold=fallback_threshold)
            except Exception:
                matched_user_id, dist = None, None
        if not matched_user_id and image_candidates and primary_candidates is not image_candidates:
            try:
                matched_user_id, dist = match_face_image(
                    image,
                    image_candidates,
                    threshold=get_image_match_threshold(len(image_candidates)),
                )
            except Exception:
                matched_user_id, dist = None, None
        if matched_user_id:
            registration = regs.filter(resident_id=matched_user_id).first()
            if registration:
                return _finalize_attendance_face(registration, user, request, dist=dist, tol=tol, fallback=True, direction=direction)

        if fallback_username:
            registration = regs.filter(resident__username=fallback_username).first()
            if not registration:
                return Response({'error': 'Username not found for the selected event.'}, status=status.HTTP_400_BAD_REQUEST)
            return _finalize_attendance_face(registration, user, request, dist=None, tol=None, fallback=True, direction=direction)
        return Response(
            {
                'error': "No matching resident found. Try again, use fallback username, or re-enroll a clearer face image.",
                'candidate_count': len(image_candidates),
                'verified_candidate_count': len(verified_image_candidates),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': f'Failed to process image: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    candidates = []
    for r in regs:
        prof = getattr(r.resident, 'profile', None)
        emb = getattr(prof, 'face_embedding', None)
        if emb:
            candidates.append((r.resident_id, emb))

    matched_user_id, dist = match_embedding(probe_emb, candidates, tolerance=tol)
    registration = regs.filter(resident_id=matched_user_id).first() if matched_user_id else None

    if not registration:
        return Response({
            "error": "No matching resident found or resident not registered for this event.",
            "candidate_count": len(candidates),
            "tolerance": tol,
            "match_distance": dist,
        }, status=status.HTTP_404_NOT_FOUND)
    return _finalize_attendance_face(registration, user, request, dist=dist, tol=tol, fallback=False, direction=direction)


def _finalize_attendance_face(registration, user, request, dist=None, tol=None, fallback=False, direction="time_in"):
    if direction == "time_out":
        return _record_time_out(
            registration,
            user,
            request,
            method="face",
            raw_payload={
                "tolerance": tol,
                "match_distance": dist,
                "fallback": fallback,
            },
            confidence=dist,
        )

    profile, error_response = _validate_registration_profile(registration)
    if error_response:
        return error_response

    try:
        with transaction.atomic():
            reg = EventRegistration.objects.select_for_update().get(id=registration.id)
            defaults = {"verified_by": user} if user else {}
            attendance, created = EventAttendance.objects.get_or_create(registration=reg, defaults=defaults)
            if not created:
                if user and attendance.verified_by_id is None:
                    attendance.verified_by = user
                    attendance.save(update_fields=["verified_by"])
                serializer = EventAttendanceSerializer(attendance, context={'request': request})
                return Response({**serializer.data, "message": "Resident already checked in.", "result_code": "duplicate"}, status=status.HTTP_200_OK)
            if not reg.attendance_confirmed:
                reg.attendance_confirmed = True
                reg.save(update_fields=["attendance_confirmed"])
    except IntegrityError:
        att = EventAttendance.objects.filter(registration=registration).first()
        serializer = EventAttendanceSerializer(att, context={'request': request}) if att else None
        return Response(
            {**(serializer.data if serializer else {}), "message": "Resident already checked in.", "result_code": "duplicate"},
            status=status.HTTP_200_OK,
        )

    logger.info(
        f"ATTENDANCE_MARKED_FACE event_id={registration.event_id} resident_id={registration.resident_id} verified_by={getattr(user, 'id', None)} distance={dist} tol={tol} fallback={fallback}"
    )
    try:
        _create_entry_log(
            registration,
            user,
            method="face",
            direction="time_in",
            confidence=dist,
            raw_payload={
                "tolerance": tol,
                "match_distance": dist,
                "fallback": fallback,
            },
        )
    except Exception as e:
        logger.info(f"[ENTRYLOG_FACE_FAIL] reg={registration.id} err={e}")
    serializer = EventAttendanceSerializer(attendance, context={'request': request})
    payload = {
        "registration_id": registration.id,
        "event_id": registration.event_id,
        "user_id": registration.resident_id,
        "verified_by_id": getattr(user, "id", None),
        "method": "face",
        "match_distance": dist,
        "tolerance": tol,
        "raw_payload": {"fallback": fallback},
    }
    _emit("attendance.marked", "events.EventAttendance", attendance.id, payload)
    _emit(
        "entrylog.created",
        "events.EntryLog",
        f"{registration.id}-face",
        {
            "event_id": registration.event_id,
            "user_id": registration.resident_id,
            "method": "face",
            "status": "allowed",
            "created_by_id": getattr(user, "id", None),
            "confidence": dist,
            "raw_payload": {"fallback": fallback},
        },
    )
    audit_log(
        request,
        actor=user,
        action="attendance_mark",
        target_type="event_attendance",
        target_id=attendance.id,
        target_label=registration.resident.username,
        metadata={
            "event_id": registration.event_id,
            "resident_user_id": registration.resident_id,
            "resident_name": registration.resident.username,
            "direction": "time_in",
            "method": "face",
            "match_distance": dist,
            "tolerance": tol,
            "fallback": fallback,
        },
    )
    return Response({**serializer.data, 'match_distance': dist, "result_code": "success"}, status=status.HTTP_201_CREATED)


# Paginated attendance for a specific event
class EventAttendanceByEventView(generics.ListAPIView):
    serializer_class = EventAttendanceSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def get_queryset(self):
        event_id = self.kwargs.get('id')
        return (
            EventAttendance.objects.select_related(
                'registration', 'registration__resident', 'registration__event', 'verified_by'
            )
            .filter(registration__event_id=event_id)
            .order_by('-checked_in_at')
        )


# Paginated list of all events
class EventListView(generics.ListAPIView):
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Event.objects.select_related('created_by').annotate(
            registrations_count=Count('registrations', distinct=True),
            attendance_count=Count('registrations__attendance', distinct=True),
        )
        include_archived = (self.request.query_params.get("include_archived") or "").strip().lower() in {"1", "true", "yes"}
        archived_only = (self.request.query_params.get("archived_only") or "").strip().lower() in {"1", "true", "yes"}
        if archived_only:
            qs = qs.filter(archived_at__isnull=False)
        elif not include_archived:
            qs = qs.filter(archived_at__isnull=True)
        visibility = (self.request.query_params.get('visibility') or '').strip().lower()
        now = timezone.now()
        active_until_filter = Q(end_date__gte=now) | Q(end_date__isnull=True, date__gte=now)
        past_filter = Q(status__in=['completed', 'cancelled']) | Q(end_date__lt=now) | Q(end_date__isnull=True, date__lt=now)

        if visibility == 'active':
            qs = qs.exclude(status__in=['completed', 'cancelled']).filter(active_until_filter)
        elif visibility == 'past':
            qs = qs.filter(past_filter)

        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(event_type__icontains=q)
                | Q(venue__icontains=q)
                | Q(description__icontains=q)
            )
        # Optional extra filters
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        type_param = self.request.query_params.get('event_type') or self.request.query_params.get('type')
        if type_param:
            qs = qs.filter(event_type=type_param)
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            dt_from = parse_datetime(date_from)
            if not dt_from:
                pd = parse_date(date_from)
                if pd:
                    dt_from = timezone.make_aware(datetime.combine(pd, dtime.min))
            if dt_from:
                qs = qs.filter(date__gte=dt_from)
        if date_to:
            dt_to = parse_datetime(date_to)
            if not dt_to:
                pd = parse_date(date_to)
                if pd:
                    dt_to = timezone.make_aware(datetime.combine(pd, dtime.max))
            if dt_to:
                qs = qs.filter(date__lte=dt_to)

        ordering = self.request.query_params.get('ordering')
        ordering_map = {
            'date': 'date',
            '-date': '-date',
            'title': 'title',
            '-title': '-title',
        }
        order = ordering_map.get(ordering, '-date')
        return qs.order_by(order)


class PublicGateEventListView(EventListView):
    permission_classes = [IsGateAccessAllowed]

    def get_queryset(self):
        now = timezone.now()
        return super().get_queryset().exclude(status__in=["completed", "cancelled"]).filter(
            Q(end_date__gte=now) | Q(end_date__isnull=True, date__gte=now)
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def export_event_registrants_csv(request, id):
    try:
        event = Event.objects.get(id=id)
    except Event.DoesNotExist:
        return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

    rows = (
        EventRegistration.objects.select_related('resident', 'event')
        .filter(event=event)
        .order_by('registered_at')
    )
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="event_{event.id}_registrants.csv"'
    writer = csv.writer(response)
    writer.writerow(['Event ID', 'Event Title', 'Resident Username', 'Registered At', 'Attendance Confirmed'])
    for r in rows:
        writer.writerow([
            event.id,
            event.title,
            getattr(r.resident, 'username', ''),
            r.registered_at,
            r.attendance_confirmed,
        ])
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def export_event_attendance_csv(request, id):
    try:
        event = Event.objects.get(id=id)
    except Event.DoesNotExist:
        return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

    rows = (
        EventAttendance.objects.select_related('registration', 'registration__resident', 'verified_by')
        .filter(registration__event=event)
        .order_by('-checked_in_at')
    )
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="event_{event.id}_attendance.csv"'
    writer = csv.writer(response)
    writer.writerow(['Event ID', 'Event Title', 'Resident Username', 'Checked In At', 'Verified By'])
    for a in rows:
        writer.writerow([
            event.id,
            event.title,
            getattr(a.registration.resident, 'username', ''),
            a.checked_in_at,
            _attendance_verifier_label(a),
        ])
    return response


# Retrieve single event (by id)
class EventDetailView(generics.RetrieveAPIView):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'id'
    lookup_url_kwarg = 'event_id'


# Registrations for a specific event (admin)
class EventRegistrationsView(generics.ListAPIView):
    serializer_class = EventRegistrationSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def get_queryset(self):
        event_id = self.kwargs.get('id')
        return (
            EventRegistration.objects
            .select_related('resident', 'resident__profile', 'event')
            .filter(event_id=event_id)
            .order_by('-registered_at')
        )


# Paginated list of all attendance (admin)
class EventAttendanceListView(generics.ListAPIView):
    serializer_class = EventAttendanceSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def get_queryset(self):
        return (
            EventAttendance.objects.select_related(
                'registration', 'registration__resident', 'registration__event', 'verified_by'
            ).order_by('-checked_in_at')
        )


class EntryLogListView(generics.ListAPIView):
    serializer_class = EntryLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrGateOperatorRole]

    def get_queryset(self):
        qs = EntryLog.objects.select_related("user", "event", "created_by")
        event_id = self.request.query_params.get("event_id")
        if event_id:
            qs = qs.filter(event_id=event_id)

        status_param = (self.request.query_params.get("status") or "").strip().lower()
        if status_param:
            qs = qs.filter(status=status_param)

        method_param = (self.request.query_params.get("method") or "").strip().lower()
        if method_param:
            qs = qs.filter(method=method_param)

        direction_param = (self.request.query_params.get("direction") or "").strip().lower()
        if direction_param:
            qs = qs.filter(direction=direction_param)

        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(user__username__icontains=q)
                | Q(event__title__icontains=q)
                | Q(created_by__username__icontains=q)
            )

        return qs.order_by("-created_at")


class PublicGateEntryLogListView(EntryLogListView):
    permission_classes = [IsGateAccessAllowed]


class ResidentGateLogListView(generics.ListAPIView):
    serializer_class = ResidentGateLogSerializer
    permission_classes = [IsGateAccessAllowed]

    def get_queryset(self):
        qs = EntryLog.objects.select_related("user", "user__profile", "created_by").filter(event__isnull=True)

        direction_param = (self.request.query_params.get("direction") or "").strip().lower()
        if direction_param:
            qs = qs.filter(direction=direction_param)

        method_param = (self.request.query_params.get("method") or "").strip().lower()
        if method_param:
            qs = qs.filter(method=method_param)

        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(user__username__icontains=q)
                | Q(user__first_name__icontains=q)
                | Q(user__last_name__icontains=q)
                | Q(user__profile__address__icontains=q)
            )

        return qs.order_by("-created_at")



class MyRegistrationIdsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsResidentUserRole]

    def get(self, request):
        user = request.user
        ids = list(
            EventRegistration.objects.filter(resident=user).values_list("event_id", flat=True)
        )
        return Response({"event_ids": ids}, status=status.HTTP_200_OK)


class AttendanceAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def get(self, request):
        # Optional date range
        def to_aware(dt_str, end_of_day=False):
            if not dt_str:
                return None
            # Treat plain YYYY-MM-DD inputs as whole-day bounds.
            if "T" not in dt_str and " " not in dt_str:
                d = parse_date(dt_str)
                if d is None:
                    return None
                t = dtime.max if end_of_day else dtime.min
                naive = datetime.combine(d, t)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            dt = parse_datetime(dt_str)
            if dt is not None:
                # If parsed datetime is naive, make it aware in current TZ
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                return dt
            d = parse_date(dt_str)
            if d is None:
                return None
            t = dtime.max if end_of_day else dtime.min
            naive = datetime.combine(d, t)
            return timezone.make_aware(naive, timezone.get_current_timezone())

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        dt_from = to_aware(date_from, end_of_day=False)
        dt_to = to_aware(date_to, end_of_day=True)

        attendance_qs = EventAttendance.objects.all()
        if dt_from:
            attendance_qs = attendance_qs.filter(checked_in_at__gte=dt_from)
        if dt_to:
            attendance_qs = attendance_qs.filter(checked_in_at__lte=dt_to)

        # KPIs
        total_events = Event.objects.count()
        total_registrations = EventRegistration.objects.count()
        total_attendance = attendance_qs.count()

        # Additional KPIs
        today_date = timezone.localdate()
        this_year = today_date.year
        events_this_year = Event.objects.filter(date__year=this_year).count()
        active_profiles = ResidentProfile.objects.filter(
            expiry_date__gte=today_date,
            archived_at__isnull=True,
            deactivated_at__isnull=True,
        )
        active_residents = active_profiles.count()
        verified_ids = active_profiles.filter(is_verified=True).count()
        avg_attendance_pct = 0.0
        if total_registrations:
            avg_attendance_pct = round((total_attendance / total_registrations) * 100, 1)

        # Simple growth: compare registrations in last 30 days vs previous 30 days
        from datetime import timedelta
        window = timedelta(days=30)
        recent_start = timezone.now() - window
        prev_start = recent_start - window
        recent_regs = EventRegistration.objects.filter(registered_at__gte=recent_start).count()
        prev_regs = EventRegistration.objects.filter(registered_at__gte=prev_start, registered_at__lt=recent_start).count()
        if prev_regs > 0:
            growth_rate = round(((recent_regs - prev_regs) / prev_regs) * 100, 1)
        else:
            growth_rate = round(recent_regs * 100.0, 1) if recent_regs else 0.0

        # Demographics (overall residents)
        gender_counts = dict.fromkeys([g.value for g in ResidentProfile.Gender], 0)
        for g_val, count in (
            active_profiles.values_list("gender")
            .order_by()
            .annotate(count=Count("id"))
        ):
            gender_counts[g_val] = count

        def age_bucket(age: int) -> str:
            if age is None:
                return "Unknown"
            if age < 18:
                return "0-17"
            if age <= 25:
                return "18-25"
            if age <= 35:
                return "26-35"
            if age <= 45:
                return "36-45"
            if age <= 60:
                return "46-60"
            return "61+"

        today = timezone.localdate()
        age_counts = {}
        residents = active_profiles.exclude(birthdate__isnull=True)
        for prof in residents:
            try:
                age_years = today.year - prof.birthdate.year - (
                    (today.month, today.day) < (prof.birthdate.month, prof.birthdate.day)
                )
            except Exception:
                age_years = None
            bucket = age_bucket(age_years)
            age_counts[bucket] = age_counts.get(bucket, 0) + 1

        # Per-event summary (top 10 by attendance)
        per_event = (
            Event.objects.annotate(
                registrations_count=Count('registrations', distinct=True),
                attendance_count=Count(
                    'registrations__attendance',
                    filter=Q(registrations__attendance__id__in=attendance_qs.values('id')),
                    distinct=True,
                ),
            )
            .values('id', 'title', 'event_type', 'date', 'registrations_count', 'attendance_count')
            .order_by('-attendance_count', '-date')[:10]
        )

        # Timeseries (attendance per day)
        timeseries = (
            attendance_qs
            .annotate(day=TruncDate('checked_in_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )

        # Upcoming events (next 30 days)
        upcoming = (
            Event.objects.filter(date__gte=timezone.now())
            .annotate(
                registrations_count=Count('registrations', distinct=True),
                attendance_count=Count('registrations__attendance', distinct=True),
            )
            .order_by('date')[:5]
        )
        upcoming_events = [
            {
                "id": e.id,
                "title": e.title,
                "date": e.date,
                "end_date": e.end_date,
                "registrations_count": getattr(e, "registrations_count", 0),
                "attendance_count": getattr(e, "attendance_count", 0),
            }
            for e in upcoming
        ]

        # Recent activity (registrations and attendance)
        recent_regs = list(
            EventRegistration.objects.select_related("event", "resident")
            .order_by("-registered_at")
            .values("event__title", "resident__username", "registered_at")[:5]
        )
        recent_att = list(
            EventAttendance.objects.select_related("registration__event", "registration__resident")
            .order_by("-checked_in_at")
            .values("registration__event__title", "registration__resident__username", "checked_in_at")[:5]
        )
        recent_activity = []
        for r in recent_regs:
            recent_activity.append(
                {
                    "type": "registration",
                    "title": r.get("event__title") or "",
                    "username": r.get("resident__username") or "",
                    "timestamp": r.get("registered_at"),
                }
            )
        for a in recent_att:
            recent_activity.append(
                {
                    "type": "attendance",
                    "title": a.get("registration__event__title") or "",
                    "username": a.get("registration__resident__username") or "",
                    "timestamp": a.get("checked_in_at"),
                }
            )
        recent_activity = sorted(recent_activity, key=lambda x: x.get("timestamp") or timezone.now(), reverse=True)[:5]

        return Response({
            'kpis': {
                'total_events': total_events,
                'total_registrations': total_registrations,
                'total_attendance': total_attendance,
                'events_this_year': events_this_year,
                'active_residents': active_residents,
                'avg_attendance': avg_attendance_pct,
                'growth_rate': growth_rate,
                'verified_ids': verified_ids,
                'registrations_recent': recent_regs,
                'registrations_prev': prev_regs,
            },
            'per_event': list(per_event),
            'timeseries': [{ 'date': str(row['day']), 'count': row['count'] } for row in timeseries],
            'demographics': {
                'gender': gender_counts,
                'age_distribution': [
                    {'bucket': label, 'count': age_counts.get(label, 0)}
                    for label in ["0-17", "18-25", "26-35", "36-45", "46-60", "61+", "Unknown"]
                ],
            },
            'upcoming_events': upcoming_events,
            'recent_activity': [
                {
                    **item,
                    "timestamp": str(item.get("timestamp")) if item.get("timestamp") else None,
                }
                for item in recent_activity
            ],
        }, status=status.HTTP_200_OK)


class EventAnalyticsByEventView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def get(self, request, event_id):
        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

        registrations_count = EventRegistration.objects.filter(event=event).count()
        attendance_qs = EventAttendance.objects.filter(registration__event=event)
        attendance_count = attendance_qs.count()
        rate = float(attendance_count) / float(registrations_count) if registrations_count else 0.0

        # Daily check-ins for the event (useful for multi-day spans)
        timeseries = (
            attendance_qs.annotate(day=TruncDate('checked_in_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )

        return Response({
            'event': {
                'id': event.id,
                'title': event.title,
                'event_type': event.event_type,
                'date': event.date,
                'end_date': event.end_date,
                'venue': event.venue,
                'status': event.status,
            },
            'registrations_count': registrations_count,
            'attendance_count': attendance_count,
            'attendance_rate': rate,
            'timeseries': [{ 'date': str(row['day']), 'count': row['count'] } for row in timeseries],
        }, status=status.HTTP_200_OK)


class EventAttendeesByEventAnalyticsView(generics.ListAPIView):
    serializer_class = EventAttendanceSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def get_queryset(self):
        event_id = self.kwargs.get('event_id')
        qs = EventAttendance.objects.select_related(
            'registration', 'registration__resident', 'registration__event', 'verified_by'
        ).filter(registration__event_id=event_id)

        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(Q(registration__resident__username__icontains=q))

        ordering = self.request.query_params.get('ordering')
        ordering_map = {
            'checked_in_at': 'checked_in_at',
            '-checked_in_at': '-checked_in_at',
            'resident_username': 'registration__resident__username',
            '-resident_username': '-registration__resident__username',
        }
        order = ordering_map.get(ordering, '-checked_in_at')
        return qs.order_by(order)

# Paginated view of current user's registrations (Resident)
class MyRegistrationsListView(generics.ListAPIView):
    serializer_class = EventRegistrationSerializer
    permission_classes = [permissions.IsAuthenticated, IsResidentUserRole]

    def get_queryset(self):
        user = self.request.user
        return (
            EventRegistration.objects.select_related('event', 'resident')
            .filter(resident=user)
            .order_by('event__date')
        )

