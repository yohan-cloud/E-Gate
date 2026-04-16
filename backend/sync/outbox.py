import json
import os
import hashlib
from typing import Any, Dict, Optional
from django.conf import settings
from .models import OutboxEvent


def _source_node_id() -> str:
    return os.getenv("NODE_ID", "local")


def _hash_payload(payload: Any) -> str:
    try:
        serialized = json.dumps(payload, sort_keys=True, default=str)
    except Exception:
        serialized = str(payload)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def emit(event_type: str, aggregate: str, aggregate_id: str, payload: Dict[str, Any], idempotency_key: Optional[str] = None):
    """
    Create an outbox event if it does not already exist (idempotent).
    """
    key = idempotency_key or f"{event_type}:{aggregate}:{aggregate_id}:{_hash_payload(payload)}"
    defaults = {
        "event_type": event_type,
        "aggregate": aggregate,
        "aggregate_id": str(aggregate_id),
        "payload": payload,
        "source_node_id": _source_node_id(),
    }
    OutboxEvent.objects.get_or_create(idempotency_key=key, defaults=defaults)
    return key
