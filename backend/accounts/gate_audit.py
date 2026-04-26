from __future__ import annotations

from typing import Any

from django.db import OperationalError, ProgrammingError

from common.audit import get_client_ip

from .models import GateAuditLog


def _json_safe(value: Any):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


def _display_name(user) -> str:
    if not user:
        return ""
    full_name = ""
    try:
        full_name = user.get_full_name().strip()
    except Exception:
        full_name = ""
    return full_name or getattr(user, "username", "") or str(user)


def gate_audit_log(
    request,
    *,
    action_type: str,
    status: str,
    details: str = "",
    gate_user=None,
    gate_username: str = "",
    gate_full_name: str = "",
    performed_by=None,
    metadata: dict[str, Any] | None = None,
):
    resolved_gate_user = gate_user
    resolved_performer = performed_by
    request_user = getattr(request, "user", None)
    if resolved_performer is None and getattr(request_user, "is_authenticated", False):
        resolved_performer = request_user

    username = gate_username or getattr(resolved_gate_user, "username", "") or ""
    full_name = gate_full_name or _display_name(resolved_gate_user)

    try:
        return GateAuditLog.objects.create(
            gate_user=resolved_gate_user,
            gate_username=username,
            gate_full_name=full_name,
            action_type=action_type,
            status=status,
            performed_by=resolved_performer,
            performed_by_label=_display_name(resolved_performer) or "System",
            details=details,
            ip_address=get_client_ip(request) if request is not None else None,
            user_agent=((request.META.get("HTTP_USER_AGENT") or "")[:1000] if request is not None else ""),
            metadata=_json_safe(metadata or {}),
        )
    except (OperationalError, ProgrammingError):
        return None
