import json
from django.test import TestCase, Client
from django.utils import timezone
from django.urls import reverse
from django.contrib.auth import get_user_model
from .models import OutboxEvent
from .outbox import emit
from .apply import apply_event


class OutboxEmitTests(TestCase):
    def test_emit_idempotent(self):
        key1 = emit("event.upserted", "events.Event", "1", {"id": 1, "title": "A"})
        key2 = emit("event.upserted", "events.Event", "1", {"id": 1, "title": "A"})
        self.assertEqual(key1, key2)
        self.assertEqual(OutboxEvent.objects.count(), 1)


class PushIdempotencyTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_push_duplicate_events_only_store_once(self):
        payload = [
            {
                "event_type": "entrylog.created",
                "aggregate": "events.EntryLog",
                "aggregate_id": "abc",
                "payload": {"foo": "bar"},
                "idempotency_key": "dup-key",
                "source_node_id": "node1",
            }
        ]
        resp1 = self.client.post("/api/sync/push/", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp1.status_code, 200)
        resp2 = self.client.post("/api/sync/push/", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(OutboxEvent.objects.count(), 1)


class IntegrationFlowTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.user = User.objects.create_user(username="sync_user", password="ResidentFlow!234", is_resident=True)

    def test_local_to_cloud_to_local_no_duplicate_apply(self):
        # Local emit
        key = emit("entrylog.created", "events.EntryLog", "123", {"event_id": None, "user_id": self.user.id})
        self.assertEqual(OutboxEvent.objects.count(), 1)
        # Push to cloud (simulated same DB here)
        payload = [
            {
                "event_type": "entrylog.created",
                "aggregate": "events.EntryLog",
                "aggregate_id": "123",
                "payload": {"event_id": None, "user_id": self.user.id},
                "idempotency_key": key,
                "source_node_id": "nodeA",
            }
        ]
        resp = self.client.post("/api/sync/push/", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp.status_code, 200)
        # Pull since none to get same event
        resp = self.client.get("/api/sync/pull/")
        self.assertEqual(resp.status_code, 200)
        events = resp.json()["events"]
        self.assertEqual(len(events), 1)
        # Apply twice to ensure idempotency
        apply_event(events[0]["event_type"], events[0]["payload"], events[0]["idempotency_key"])
        apply_event(events[0]["event_type"], events[0]["payload"], events[0]["idempotency_key"])
        # Outbox count should stay 1 (idempotency prevents new records)
        self.assertEqual(OutboxEvent.objects.count(), 1)
