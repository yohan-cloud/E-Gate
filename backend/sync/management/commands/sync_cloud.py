import os
import time
import json
import logging
from datetime import datetime
import requests
from django.core.management.base import BaseCommand
from django.utils import timezone
from sync.models import OutboxEvent, SyncState
from sync.apply import apply_event

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Push outbox events to cloud and pull new events."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Run one cycle then exit")

    def handle(self, *args, **options):
        mode = os.getenv("SYNC_MODE", "local").lower()
        if mode not in ("local", "cloud"):
            self.stderr.write("SYNC_MODE must be 'local' or 'cloud'")
            return

        if mode == "cloud":
            self.stdout.write("Cloud mode: endpoints only; nothing to push.")
            return

        base_url = os.getenv("CLOUD_SYNC_BASE_URL", "").rstrip("/")
        secret = os.getenv("SYNC_SHARED_SECRET", "")
        node_id = os.getenv("NODE_ID", "local")
        if not base_url:
            self.stderr.write("CLOUD_SYNC_BASE_URL is required in local mode.")
            return

        while True:
            self._push_outbox(base_url, secret, node_id)
            self._pull_and_apply(base_url, secret)
            if options.get("once"):
                break
            time.sleep(5)

    def _push_outbox(self, base_url: str, secret: str, node_id: str):
        unsent = OutboxEvent.objects.filter(sent_at__isnull=True).order_by("created_at")[:100]
        if not unsent:
            return
        payload = []
        for ev in unsent:
            payload.append(
                {
                    "event_type": ev.event_type,
                    "aggregate": ev.aggregate,
                    "aggregate_id": ev.aggregate_id,
                    "payload": ev.payload,
                    "idempotency_key": ev.idempotency_key,
                    "source_node_id": node_id,
                }
            )
        try:
            resp = requests.post(
                f"{base_url}/api/sync/push/",
                data=json.dumps(payload),
                headers={
                    "Content-Type": "application/json",
                    "X-Sync-Secret": secret,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                now = timezone.now()
                OutboxEvent.objects.filter(id__in=[e.id for e in unsent]).update(sent_at=now, last_error=None)
            else:
                msg = f"Push failed status={resp.status_code} body={resp.text}"
                for ev in unsent:
                    ev.mark_error(msg)
                logger.warning(msg)
        except Exception as exc:
            msg = f"Push exception: {exc}"
            for ev in unsent:
                ev.mark_error(msg)
            logger.exception(exc)

    def _pull_and_apply(self, base_url: str, secret: str):
        state = SyncState.get_default()
        params = {}
        if state.last_pull_cursor:
            params["since"] = state.last_pull_cursor.isoformat()
        try:
            resp = requests.get(
                f"{base_url}/api/sync/pull/",
                params=params,
                headers={"X-Sync-Secret": secret},
                timeout=10,
            )
            if resp.status_code != 200:
                logger.warning("Pull failed status=%s body=%s", resp.status_code, resp.text)
                return
            data = resp.json()
            events = data.get("events", [])
            for ev in events:
                apply_event(ev.get("event_type", ""), ev.get("payload", {}), ev.get("idempotency_key", ""))
            cursor = data.get("cursor")
            if cursor:
                try:
                    ts = datetime.fromisoformat(cursor)
                    if timezone.is_naive(ts):
                        ts = timezone.make_aware(ts)
                    state.last_pull_cursor = ts
                    state.save(update_fields=["last_pull_cursor", "updated_at"])
                except Exception:
                    pass
        except Exception as exc:
            logger.exception(exc)
