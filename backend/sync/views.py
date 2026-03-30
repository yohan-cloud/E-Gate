import os
import hmac
import hashlib
from datetime import datetime
from typing import List, Dict, Any
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.http import JsonResponse, HttpRequest
from django.db import transaction
from django.conf import settings
from .models import OutboxEvent, SyncState
from .apply import apply_event


def _secret_valid(request: HttpRequest) -> bool:
    shared = os.getenv("SYNC_SHARED_SECRET")
    if not shared:
        return True  # fallback for local dev
    presented = request.headers.get("X-Sync-Secret") or request.headers.get("x-sync-secret")
    if not presented:
        return False
    return hmac.compare_digest(shared, presented)


def _mode_cloud() -> bool:
    return os.getenv("SYNC_MODE", "local").lower() == "cloud"


@csrf_exempt
def push_events(request: HttpRequest):
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    if not _secret_valid(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)
    events: List[Dict[str, Any]] = []
    try:
        import json

        body = json.loads(request.body or "[]")
        if isinstance(body, list):
            events = body
        else:
            events = body.get("events", [])
    except Exception:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    results = []
    for ev in events:
        key = ev.get("idempotency_key")
        if not key:
            continue
        defaults = {
            "event_type": ev.get("event_type", ""),
            "aggregate": ev.get("aggregate", ""),
            "aggregate_id": str(ev.get("aggregate_id", "")),
            "payload": ev.get("payload", {}),
            "source_node_id": ev.get("source_node_id", "remote"),
        }
        _, created = OutboxEvent.objects.get_or_create(idempotency_key=key, defaults=defaults)
        results.append({"idempotency_key": key, "stored": created})
    return JsonResponse({"results": results}, status=200)


@csrf_exempt
def pull_events(request: HttpRequest):
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)
    if not _secret_valid(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)

    since = request.GET.get("since")
    qs = OutboxEvent.objects.all().order_by("created_at")
    if since:
        try:
            ts = datetime.fromisoformat(since)
            if timezone.is_naive(ts):
                ts = timezone.make_aware(ts)
            qs = qs.filter(created_at__gt=ts)
        except Exception:
            pass

    events = list(
        qs.values(
            "event_type",
            "aggregate",
            "aggregate_id",
            "payload",
            "idempotency_key",
            "created_at",
            "source_node_id",
        )
    )
    new_cursor = events[-1]["created_at"].isoformat() if events else since
    return JsonResponse({"events": events, "cursor": new_cursor}, status=200, safe=False)
