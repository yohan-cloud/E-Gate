from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction

from accounts.permissions import IsAdminOrGateOperatorRole, IsAdminUserRole, IsGateAccessAllowed
from accounts.gate_audit import gate_audit_log
from accounts.models import GateAuditLog

from .archive import archive_guest_appointment
from .models import AdminSetting, AuditLog, GuestAppointment, GuestAppointmentScanLog
from .serializers import (
    AdminSettingSerializer,
    AuditLogSerializer,
    GuestAppointmentGateLookupSerializer,
    GuestAppointmentScanLogSerializer,
    GuestAppointmentSerializer,
)


ADMIN_UI_DEFAULTS = {
    "autoRefreshAnalytics": True,
    "compactTables": False,
    "scannerSound": True,
    "highlightPendingVerifications": True,
    "rememberFilters": True,
}


def _parse_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return None


def _today_guest_queryset():
    today = timezone.localdate()
    start = timezone.make_aware(datetime.combine(today, time.min))
    end = timezone.make_aware(datetime.combine(today + timedelta(days=1), time.min))
    return GuestAppointment.objects.filter(
        eta__gte=start,
        eta__lt=end,
        archived_at__isnull=True,
    ).exclude(status=GuestAppointment.Status.CANCELLED)


def _upcoming_guest_queryset():
    today = timezone.localdate()
    start = timezone.make_aware(datetime.combine(today, time.min))
    return GuestAppointment.objects.filter(
        eta__gte=start,
        archived_at__isnull=True,
    ).exclude(status=GuestAppointment.Status.CANCELLED)


def _appointment_qr_window_error(guest, now=None):
    now = now or timezone.now()
    local_now = timezone.localtime(now)
    local_eta = timezone.localtime(guest.eta)
    if local_now.date() < local_eta.date():
        return "scheduled_later", "Guest appointment is scheduled for a later date."
    if local_now.date() > local_eta.date():
        return "expired", "Guest appointment has expired."
    return None, None


def _guest_scan_payload(guest, direction, method, result_code, message, actor=None, timestamp=None):
    return {
        "appointment_id": guest.id,
        "guest_name": guest.name,
        "guest_contact": guest.contact,
        "purpose": guest.purpose,
        "eta": guest.eta,
        "status": guest.status,
        "direction": direction,
        "method": method,
        "result_code": result_code,
        "message": message,
        "logged_at": timestamp,
        "checked_in_at": guest.checked_in_at,
        "checked_out_at": guest.checked_out_at,
        "recorded_by": getattr(actor, "username", None),
    }


def _record_guest_scan_log(guest, direction, method, actor=None, reason=""):
    return GuestAppointmentScanLog.objects.create(
        appointment=guest,
        direction=direction,
        method=method,
        created_by=actor,
        reason=reason or "",
    )


def _handle_guest_scan(guest, direction="time_in", actor=None, method="qr", manual_override=False):
    if guest.archived_at:
        return None, Response(
            {"error": "Guest appointment is archived.", "result_code": "archived"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if guest.status == GuestAppointment.Status.CANCELLED:
        return None, Response(
            {"error": "Guest appointment is cancelled.", "result_code": "cancelled"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    direction = (direction or "auto").strip().lower()
    if direction == "auto":
        direction = GuestAppointmentScanLog.Direction.TIME_OUT if guest.checked_in_at and not guest.checked_out_at else GuestAppointmentScanLog.Direction.TIME_IN
    if direction not in {GuestAppointmentScanLog.Direction.TIME_IN, GuestAppointmentScanLog.Direction.TIME_OUT}:
        return None, Response(
            {"error": "Direction must be time_in or time_out.", "result_code": "invalid_direction"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if direction == GuestAppointmentScanLog.Direction.TIME_IN:
        if not manual_override:
            code, message = _appointment_qr_window_error(guest)
            if code:
                return None, Response({"error": message, "result_code": code}, status=status.HTTP_400_BAD_REQUEST)
        if guest.checked_in_at:
            return None, Response(
                {"error": "Guest appointment was already used for check-in.", "result_code": "already_used"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        guest.checked_in_at = now
        guest.checked_in_by = actor
        guest.status = GuestAppointment.Status.ARRIVED
        guest.save(update_fields=["checked_in_at", "checked_in_by", "status", "updated_at"])
        _record_guest_scan_log(guest, direction, method, actor=actor)
        return guest, Response(
            _guest_scan_payload(
                guest,
                direction=direction,
                method=method,
                result_code="checked_in",
                message="Guest appointment check-in recorded.",
                actor=actor,
                timestamp=now,
            ),
            status=status.HTTP_201_CREATED,
        )

    if not guest.checked_in_at:
        return None, Response(
            {"error": "Guest appointment has not been checked in yet.", "result_code": "not_checked_in"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if guest.checked_out_at:
        return None, Response(
            {"error": "Guest appointment was already checked out.", "result_code": "already_checked_out"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    guest.checked_out_at = now
    guest.checked_out_by = actor
    guest.status = GuestAppointment.Status.COMPLETED
    guest.save(update_fields=["checked_out_at", "checked_out_by", "status", "updated_at"])
    _record_guest_scan_log(guest, direction, method, actor=actor)
    return guest, Response(
        _guest_scan_payload(
            guest,
            direction=direction,
            method=method,
            result_code="checked_out",
            message="Guest appointment check-out recorded.",
            actor=actor,
            timestamp=now,
        ),
        status=status.HTTP_201_CREATED,
    )


def _log_guest_gate_activity(request, response, *, method="qr", manual=False, appointment_id=None):
    actor = request.user if getattr(request.user, "is_authenticated", False) else None
    gate_actor = actor if getattr(actor, "is_gate_operator", False) else None
    data = getattr(response, "data", {}) or {}
    is_success = getattr(response, "status_code", 500) < 400
    action_type = GateAuditLog.ActionType.MANUAL_ENTRY if manual else (
        GateAuditLog.ActionType.QR_SCAN_SUCCESS if is_success else GateAuditLog.ActionType.QR_SCAN_DENIED
    )
    gate_audit_log(
        request,
        action_type=action_type,
        status=GateAuditLog.Status.SUCCESS if is_success else GateAuditLog.Status.DENIED,
        details=data.get("message") or data.get("error") or ("Guest gate scan recorded." if is_success else "Guest gate scan denied."),
        gate_user=gate_actor,
        gate_username=getattr(gate_actor, "username", "") if gate_actor else "",
        gate_full_name=(gate_actor.get_full_name().strip() if gate_actor else "") or (getattr(gate_actor, "username", "") if gate_actor else ""),
        performed_by=actor,
        metadata={
            "method": method,
            "result_code": data.get("result_code", ""),
            "appointment_id": data.get("appointment_id") or appointment_id,
            "guest_name": data.get("guest_name", ""),
            "mode": "guest_appointment",
        },
    )
    return response


class GuestAppointmentListCreateView(generics.ListCreateAPIView):
    serializer_class = GuestAppointmentSerializer
    pagination_class = None

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated(), IsAdminOrGateOperatorRole()]
        return [IsAuthenticated(), IsAdminUserRole()]

    def get_queryset(self):
        qs = GuestAppointment.objects.all()
        status_filter = (self.request.query_params.get("status") or "").strip().lower()
        date_filter = _parse_date(self.request.query_params.get("date"))
        query = (self.request.query_params.get("q") or "").strip()
        include_archived = (self.request.query_params.get("include_archived") or "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        archived_only = (self.request.query_params.get("archived_only") or "").strip().lower() in {
            "1",
            "true",
            "yes",
        }

        if date_filter:
            start = timezone.make_aware(datetime.combine(date_filter, time.min))
            end = timezone.make_aware(datetime.combine(date_filter + timedelta(days=1), time.min))
            qs = qs.filter(eta__gte=start, eta__lt=end)
        if archived_only:
            qs = qs.filter(archived_at__isnull=False)
        elif not include_archived:
            qs = qs.filter(archived_at__isnull=True)
        if status_filter:
            qs = qs.filter(status=status_filter)
        if query:
            qs = qs.filter(
                Q(name__icontains=query)
                | Q(organization_company__icontains=query)
                | Q(contact__icontains=query)
                | Q(purpose__icontains=query)
                | Q(notes__icontains=query)
            )
        return qs.select_related("created_by", "updated_by")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)


class GuestAppointmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = GuestAppointment.objects.select_related("created_by", "updated_by", "archived_by")
    serializer_class = GuestAppointmentSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated(), IsAdminOrGateOperatorRole()]
        return [IsAuthenticated(), IsAdminUserRole()]

    def perform_update(self, serializer):
        if getattr(serializer.instance, "archived_at", None):
            raise ValidationError("Archived guest appointments cannot be modified.")
        serializer.save(updated_by=self.request.user)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminOrGateOperatorRole])
def guests_today(request):
    qs = _today_guest_queryset()
    serializer = GuestAppointmentSerializer(
        qs.select_related("created_by", "updated_by"),
        many=True,
    )
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsGateAccessAllowed])
def gate_lookup_guest_appointments(request):
    q = (request.query_params.get("q") or "").strip()
    qs = _upcoming_guest_queryset().select_related("created_by", "updated_by")
    if q:
        qs = qs.filter(
            Q(name__icontains=q)
            | Q(organization_company__icontains=q)
            | Q(contact__icontains=q)
            | Q(purpose__icontains=q)
            | Q(notes__icontains=q)
            | Q(id__iexact=q)
        )
    serializer = GuestAppointmentGateLookupSerializer(qs.order_by("eta", "name")[:20], many=True)
    return Response(serializer.data)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def admin_ui_settings(request):
    setting, _ = AdminSetting.objects.get_or_create(
        user=request.user,
        key="admin_ui",
        defaults={"value": ADMIN_UI_DEFAULTS},
    )

    if request.method == "GET":
        return Response(
            {
                "key": setting.key,
                "value": {**ADMIN_UI_DEFAULTS, **(setting.value or {})},
                "updated_at": setting.updated_at,
            }
        )

    serializer = AdminSettingSerializer(setting, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    value = serializer.validated_data.get("value", {})
    setting.value = {**ADMIN_UI_DEFAULTS, **value}
    setting.save(update_fields=["value", "updated_at"])
    return Response(
        {
            "key": setting.key,
            "value": setting.value,
            "updated_at": setting.updated_at,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def archive_guest(request, pk):
    with transaction.atomic():
        guest = GuestAppointment.objects.select_for_update().filter(pk=pk).first()
        if not guest:
            return Response({"error": "Guest appointment not found."}, status=status.HTTP_404_NOT_FOUND)
        if guest.archived_at:
            serializer = GuestAppointmentSerializer(guest)
            return Response(
                {**serializer.data, "message": "Guest appointment already archived."},
                status=status.HTTP_200_OK,
            )
        try:
            guest = archive_guest_appointment(guest, request.user)
        except Exception as exc:
            guest.archive_status = "failed"
            guest.archive_error = str(exc)
            guest.save(update_fields=["archive_status", "archive_error"])
            return Response({"error": f"Archive failed: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    serializer = GuestAppointmentSerializer(guest)
    return Response(
        {**serializer.data, "message": "Guest appointment archived."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def unarchive_guest(request, pk):
    with transaction.atomic():
        guest = GuestAppointment.objects.select_for_update().filter(pk=pk).first()
        if not guest:
            return Response({"error": "Guest appointment not found."}, status=status.HTTP_404_NOT_FOUND)
        if not guest.archived_at:
            serializer = GuestAppointmentSerializer(guest)
            return Response(
                {**serializer.data, "message": "Guest appointment is already active."},
                status=status.HTTP_200_OK,
            )

        guest.archived_at = None
        guest.archived_by = None
        guest.archive_status = "active"
        guest.archive_error = ""
        guest.updated_by = request.user
        guest.save(
            update_fields=[
                "archived_at",
                "archived_by",
                "archive_status",
                "archive_error",
                "updated_by",
                "updated_at",
            ]
        )

    serializer = GuestAppointmentSerializer(guest)
    return Response(
        {**serializer.data, "message": "Guest appointment restored."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def gate_scan_guest_appointment(request):
    token = (request.data.get("token") or "").strip()
    direction = (request.data.get("direction") or "auto").strip().lower()
    if not token:
        response = Response({"error": "QR token is required.", "result_code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        return _log_guest_gate_activity(request, response, method="qr")

    guest = GuestAppointment.objects.filter(qr_token=token).first()
    if not guest:
        response = Response({"error": "Guest appointment QR was not found.", "result_code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        return _log_guest_gate_activity(request, response, method="qr")

    _, response = _handle_guest_scan(guest, direction=direction, actor=None, method="qr", manual_override=False)
    return _log_guest_gate_activity(request, response, method="qr", appointment_id=guest.id)


@api_view(["POST"])
@permission_classes([IsGateAccessAllowed])
def gate_manual_guest_scan(request):
    guest_id = request.data.get("appointment_id") or request.data.get("id")
    direction = (request.data.get("direction") or "auto").strip().lower()
    if not guest_id:
        response = Response({"error": "Appointment ID is required.", "result_code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        return _log_guest_gate_activity(request, response, method="manual", manual=True)

    guest = _today_guest_queryset().filter(pk=guest_id).first()
    if not guest:
        response = Response(
            {"error": "Today's guest appointment was not found.", "result_code": "not_found"},
            status=status.HTTP_404_NOT_FOUND,
        )
        return _log_guest_gate_activity(request, response, method="manual", manual=True, appointment_id=guest_id)

    actor = request.user if getattr(request.user, "is_authenticated", False) else None
    _, response = _handle_guest_scan(guest, direction=direction, actor=actor, method="manual", manual_override=True)
    return _log_guest_gate_activity(request, response, method="manual", manual=True, appointment_id=guest.id)


class GuestAppointmentGateLogListView(generics.ListAPIView):
    serializer_class = GuestAppointmentScanLogSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        qs = GuestAppointmentScanLog.objects.select_related("appointment", "created_by")
        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(appointment__name__icontains=q)
                | Q(appointment__organization_company__icontains=q)
                | Q(appointment__purpose__icontains=q)
                | Q(appointment__contact__icontains=q)
            )
        direction = (self.request.query_params.get("direction") or "").strip().lower()
        if direction:
            qs = qs.filter(direction=direction)
        return qs.order_by("-created_at")[:30]


class AuditLogListView(generics.ListAPIView):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdminUserRole]
    pagination_class = None

    def get_queryset(self):
        qs = AuditLog.objects.select_related("actor")
        q = (self.request.query_params.get("q") or "").strip()
        action = (self.request.query_params.get("action") or "").strip()
        actor = (self.request.query_params.get("actor") or "").strip()
        resident = (self.request.query_params.get("resident") or "").strip()
        date_from = _parse_date(self.request.query_params.get("date_from"))
        date_to = _parse_date(self.request.query_params.get("date_to"))

        if action:
            qs = qs.filter(action=action)
        if actor:
            qs = qs.filter(actor__username__icontains=actor)
        if resident:
            qs = qs.filter(
                Q(target_label__icontains=resident)
                | Q(metadata__resident_name__icontains=resident)
                | Q(metadata__username__icontains=resident)
            )
        if q:
            qs = qs.filter(
                Q(action__icontains=q)
                | Q(target_type__icontains=q)
                | Q(target_label__icontains=q)
                | Q(actor__username__icontains=q)
                | Q(metadata__resident_name__icontains=q)
                | Q(metadata__username__icontains=q)
            )
        if date_from:
            start = timezone.make_aware(datetime.combine(date_from, time.min))
            qs = qs.filter(created_at__gte=start)
        if date_to:
            end = timezone.make_aware(datetime.combine(date_to + timedelta(days=1), time.min))
            qs = qs.filter(created_at__lt=end)

        return qs.order_by("-created_at", "-id")[:300]


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def admin_manual_guest_scan(request, pk):
    with transaction.atomic():
        guest = GuestAppointment.objects.select_for_update().filter(pk=pk).first()
        if not guest:
            response = Response({"error": "Guest appointment not found.", "result_code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
            return _log_guest_gate_activity(request, response, method="manual", manual=True, appointment_id=pk)
        _, response = _handle_guest_scan(
            guest,
            direction=request.data.get("direction") or "time_in",
            actor=request.user,
            method="manual",
            manual_override=True,
        )
        return _log_guest_gate_activity(request, response, method="manual", manual=True, appointment_id=guest.id)
