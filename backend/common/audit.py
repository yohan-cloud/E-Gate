from __future__ import annotations

from typing import Any

from django.db import OperationalError, ProgrammingError

from .models import AuditLog


def get_client_ip(request) -> str | None:
    forwarded_for = (request.META.get("HTTP_X_FORWARDED_FOR") or "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or None
    remote_addr = (request.META.get("REMOTE_ADDR") or "").strip()
    return remote_addr or None


def _json_safe(value: Any):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if hasattr(value, "dict"):
        try:
            return _json_safe(value.dict())
        except Exception:
            pass
    if hasattr(value, "lists"):
        try:
            return {key: [_json_safe(item) for item in values] for key, values in value.lists()}
        except Exception:
            pass
    return str(value)


def audit_log(
    request,
    *,
    action: str,
    target_type: str,
    target_id: Any = "",
    target_label: str = "",
    metadata: dict[str, Any] | None = None,
    actor=None,
):
    resolved_actor = actor
    if resolved_actor is None:
        user = getattr(request, "user", None)
        if getattr(user, "is_authenticated", False):
            resolved_actor = user

    try:
        return AuditLog.objects.create(
            actor=resolved_actor,
            action=action,
            target_type=target_type,
            target_id=str(target_id or ""),
            target_label=target_label or "",
            ip_address=get_client_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:1000],
            metadata=_json_safe(metadata or {}),
        )
    except (OperationalError, ProgrammingError):
        return None
