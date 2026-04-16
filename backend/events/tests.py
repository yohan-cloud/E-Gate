from django.test import TestCase, override_settings
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch as mock_patch
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from residents.models import ResidentProfile
from events.models import EventAttendance, Event


@override_settings(
    REST_FRAMEWORK={
        'DEFAULT_AUTHENTICATION_CLASSES': (
            'rest_framework_simplejwt.authentication.JWTAuthentication',
        ),
        'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
        'PAGE_SIZE': 20,
        'DEFAULT_THROTTLE_CLASSES': [],
        'DEFAULT_THROTTLE_RATES': {'user': '10000/min', 'anon': '10000/min'},
    }
)
class EventsFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tempdir = TemporaryDirectory()
        cache.clear()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_flow",
            password="AdminFlow!234",
            is_admin=True,
            is_staff=True,
        )
        login = self.client.post(
            "/api/accounts/login/admin/",
            {"username": "admin_flow", "password": "AdminFlow!234"},
            format="json",
        )
        if login.status_code != status.HTTP_200_OK:
            self.fail(f"Admin login failed: {login.status_code} {getattr(login, 'data', None)}")
        self.admin_token = login.data["tokens"]["access"]

        # Create a resident
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.admin_token}")
        self.client.post(
            "/api/accounts/register/resident/",
            {
                "username": "res_flow",
                "password": "ResidentFlow!234",
                "email": "res_flow@example.com",
                "address": "Block 1 Lot 9",
                "birthdate": "2000-01-01",
                "phone_number": "09171234568",
            },
            format="json",
        )
        self.client.credentials()
        rlogin = self.client.post(
            "/api/accounts/login/resident/",
            {"username": "res_flow", "password": "ResidentFlow!234"},
            format="json",
        )
        if rlogin.status_code != status.HTTP_200_OK:
            self.fail(f"Resident login failed: {rlogin.status_code} {getattr(rlogin, 'data', None)}")
        self.res_token = rlogin.data["tokens"]["access"]
        self.resident = User.objects.get(username="res_flow")
        ResidentProfile.objects.filter(user=self.resident).update(
            is_verified=True,
            verified_at=timezone.now(),
        )

    def tearDown(self):
        self.tempdir.cleanup()

    def auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def create_open_event(self, title="Clinic Day", capacity=10):
        self.auth(self.admin_token)
        now = timezone.now()
        payload = {
            "title": title,
            "event_type": "community_events",
            "audience_type": "all",
            "date": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=3, hours=2)).isoformat(),
            "venue": "Hall",
            "capacity": capacity,
            "registration_open": (now - timedelta(minutes=1)).isoformat(),
            "registration_close": (now + timedelta(days=2)).isoformat(),
        }
        res = self.client.post("/api/events/create/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        return res.data["id"]

    def test_event_create_register_attendance_unreg(self):
        event_id = self.create_open_event()

        # Resident registers
        self.auth(self.res_token)
        res = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(res.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        # Get resident barangay_id for attendance mark
        p = self.client.get("/api/residents/profile/")
        self.assertEqual(p.status_code, status.HTTP_200_OK)
        barangay_id = p.data["barangay_id"]

        ResidentProfile.objects.filter(user=self.resident).update(is_verified=True)

        # Admin marks attendance
        self.auth(self.admin_token)
        res = self.client.post(
            "/api/events/attendance/mark/",
            {"barangay_id": barangay_id, "event_id": event_id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Resident cannot unregister after check-in
        self.auth(self.res_token)
        res = self.client.post(f"/api/events/{event_id}/unregister/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unverified_resident_cannot_register_for_event(self):
        event_id = self.create_open_event(title="Verification Gate")
        ResidentProfile.objects.filter(user=self.resident).update(is_verified=False, verified_at=None)

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertEqual(reg.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(reg.data.get("result_code"), "not_verified")

    def test_non_kid_resident_cannot_register_for_kids_only_event(self):
        event_id = self.create_open_event(title="Kids Day", capacity=20)
        Event.objects.filter(id=event_id).update(audience_type="kids_only")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertEqual(reg.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(reg.data.get("error"), "This event is for kids only.")
        self.assertEqual(reg.data.get("result_code"), "audience_kids_only")

    def test_non_senior_resident_cannot_register_for_senior_only_event(self):
        event_id = self.create_open_event(title="Senior Wellness", capacity=20)
        Event.objects.filter(id=event_id).update(audience_type="senior_only")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertEqual(reg.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(reg.data.get("error"), "This event is for senior residents only.")
        self.assertEqual(reg.data.get("result_code"), "audience_senior_only")

    def test_kid_resident_can_register_for_kids_only_event(self):
        User = get_user_model()
        child = User.objects.create_user(
            username="kid_resident",
            password="KidFlow!234",
            is_resident=True,
            email="kid@example.com",
        )
        ResidentProfile.objects.create(
            user=child,
            address="Block 5 Lot 2",
            birthdate=timezone.localdate() - timedelta(days=10 * 365),
            phone_number="09171234570",
            is_verified=True,
            verified_at=timezone.now(),
        )
        child_login = self.client.post(
            "/api/accounts/login/resident/",
            {"username": "kid_resident", "password": "KidFlow!234"},
            format="json",
        )
        self.assertEqual(child_login.status_code, status.HTTP_200_OK)
        kid_token = child_login.data["tokens"]["access"]

        event_id = self.create_open_event(title="Kids Story Time", capacity=20)
        Event.objects.filter(id=event_id).update(audience_type="kids_only")

        self.auth(kid_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

    def test_my_registrations_paginated_endpoint(self):
        # Admin creates an event that is open for registration now
        self.auth(self.admin_token)
        payload = {
            "title": "Town Hall",
            "event_type": "community_events",
            "date": (timezone.now() + timedelta(days=3)).isoformat(),
            "end_date": (timezone.now() + timedelta(days=3, hours=2)).isoformat(),
            "venue": "Gym",
            "capacity": 5,
            "registration_open": (timezone.now() - timedelta(minutes=1)).isoformat(),
            "registration_close": (timezone.now() + timedelta(days=2)).isoformat(),
        }
        res = self.client.post("/api/events/create/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        event_id = res.data["id"]

        # Resident registers
        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        # Resident fetches paginated registrations
        paged = self.client.get("/api/events/my-registrations/paginated/")
        self.assertEqual(paged.status_code, status.HTTP_200_OK)
        # Default DRF pagination returns dict with 'results'
        self.assertIn("results", paged.data)
        self.assertTrue(any(item.get("event") == event_id for item in paged.data["results"]))

    def test_entry_logs_endpoint_returns_scanner_activity(self):
        event_id = self.create_open_event(title="Gate Log Event")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        profile = self.client.get("/api/residents/profile/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        ResidentProfile.objects.filter(user=self.resident).update(is_verified=True)

        self.auth(self.admin_token)
        mark = self.client.post(
            "/api/events/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id},
            format="json",
        )
        self.assertEqual(mark.status_code, status.HTTP_201_CREATED)

        logs = self.client.get(f"/api/events/entry-logs/?event_id={event_id}")
        self.assertEqual(logs.status_code, status.HTTP_200_OK)
        self.assertIn("results", logs.data)
        self.assertGreaterEqual(len(logs.data["results"]), 1)
        item = logs.data["results"][0]
        self.assertEqual(item["event"], event_id)
        self.assertEqual(item["username"], "res_flow")
        self.assertEqual(item["status"], "allowed")
        self.assertEqual(item["method"], "qr")
        self.assertIn("created_at", item)

    @override_settings(ALLOW_PUBLIC_GATE=True)
    def test_public_gate_endpoints_allow_time_in_without_login(self):
        event_id = self.create_open_event(title="Public Gate Event")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        profile = self.client.get("/api/residents/profile/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        ResidentProfile.objects.filter(user=self.resident).update(is_verified=True)
        self.client.credentials()

        events = self.client.get("/api/events/gate/events/")
        self.assertEqual(events.status_code, status.HTTP_200_OK)
        results = events.data.get("results", events.data)
        self.assertTrue(any(item.get("id") == event_id for item in results))

        mark = self.client.post(
            "/api/events/gate/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id, "direction": "time_in"},
            format="json",
        )
        self.assertEqual(mark.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mark.data.get("result_code"), "success")

        logs = self.client.get(f"/api/events/gate/entry-logs/?event_id={event_id}&direction=time_in")
        self.assertEqual(logs.status_code, status.HTTP_200_OK)
        self.assertIn("results", logs.data)
        self.assertGreaterEqual(len(logs.data["results"]), 1)
        self.assertEqual(logs.data["results"][0]["direction"], "time_in")

    @override_settings(ALLOW_PUBLIC_GATE=True)
    def test_public_gate_resident_log_auto_toggles_direction(self):
        profile = ResidentProfile.objects.get(user=self.resident)
        profile.is_verified = True
        profile.save(update_fields=["is_verified"])
        self.client.credentials()

        first = self.client.post(
            "/api/events/gate/resident-log/mark/",
            {"barangay_id": str(profile.barangay_id)},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data["result_code"], "time_in")

        second = self.client.post(
            "/api/events/gate/resident-log/mark/",
            {"barangay_id": str(profile.barangay_id)},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.data["result_code"], "time_out")

        logs = self.client.get("/api/events/gate/resident-log/logs/?q=res_flow")
        self.assertEqual(logs.status_code, status.HTTP_200_OK)
        self.assertIn("results", logs.data)
        self.assertEqual(logs.data["results"][0]["direction"], "time_out")

    @override_settings(ALLOW_PUBLIC_GATE=True)
    def test_public_gate_resident_log_requires_verified_resident(self):
        profile = ResidentProfile.objects.get(user=self.resident)
        profile.is_verified = False
        profile.verified_at = None
        profile.save(update_fields=["is_verified", "verified_at"])
        self.client.credentials()

        res = self.client.post(
            "/api/events/gate/resident-log/mark/",
            {"barangay_id": str(profile.barangay_id)},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data["result_code"], "not_verified")

    @override_settings(ALLOW_PUBLIC_GATE=True)
    def test_public_gate_resident_log_allows_explicit_direction_choice(self):
        profile = ResidentProfile.objects.get(user=self.resident)
        profile.is_verified = True
        profile.save(update_fields=["is_verified"])
        self.client.credentials()

        explicit_in = self.client.post(
            "/api/events/gate/resident-log/mark/",
            {"barangay_id": str(profile.barangay_id), "direction": "time_in"},
            format="json",
        )
        self.assertEqual(explicit_in.status_code, status.HTTP_201_CREATED)
        self.assertEqual(explicit_in.data["result_code"], "time_in")

        duplicate_in = self.client.post(
            "/api/events/gate/resident-log/mark/",
            {"barangay_id": str(profile.barangay_id), "direction": "time_in"},
            format="json",
        )
        self.assertEqual(duplicate_in.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(duplicate_in.data["result_code"], "already_timed_in")

        explicit_out = self.client.post(
            "/api/events/gate/resident-log/mark/",
            {"barangay_id": str(profile.barangay_id), "direction": "time_out"},
            format="json",
        )
        self.assertEqual(explicit_out.status_code, status.HTTP_201_CREATED)
        self.assertEqual(explicit_out.data["result_code"], "time_out")

    @override_settings(ALLOW_PUBLIC_GATE=True)
    def test_public_gate_time_out_creates_exit_log(self):
        event_id = self.create_open_event(title="Public Gate Exit")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        profile = self.client.get("/api/residents/profile/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        ResidentProfile.objects.filter(user=self.resident).update(is_verified=True)
        self.client.credentials()

        mark_in = self.client.post(
            "/api/events/gate/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id, "direction": "time_in"},
            format="json",
        )
        self.assertEqual(mark_in.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mark_in.data.get("result_code"), "success")

        mark = self.client.post(
            "/api/events/gate/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id, "direction": "time_out"},
            format="json",
        )
        self.assertEqual(mark.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mark.data.get("result_code"), "time_out")

        logs = self.client.get(f"/api/events/gate/entry-logs/?event_id={event_id}&direction=time_out")
        self.assertEqual(logs.status_code, status.HTTP_200_OK)
        self.assertIn("results", logs.data)
        self.assertGreaterEqual(len(logs.data["results"]), 1)
        self.assertEqual(logs.data["results"][0]["direction"], "time_out")

    def test_authenticated_gate_attendance_records_verifier(self):
        event_id = self.create_open_event(title="Authenticated Gate Attendance")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        profile = self.client.get("/api/residents/profile/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        barangay_id = profile.data["barangay_id"]

        self.auth(self.admin_token)
        mark = self.client.post(
            "/api/events/gate/attendance/mark/",
            {"barangay_id": barangay_id, "event_id": event_id, "direction": "time_in"},
            format="json",
        )
        self.assertEqual(mark.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mark.data.get("verified_by"), self.admin.username)

        attendance = EventAttendance.objects.latest("checked_in_at")
        self.assertEqual(attendance.verified_by, self.admin)

    @override_settings(ALLOW_PUBLIC_GATE=True)
    def test_public_gate_time_out_requires_prior_time_in(self):
        event_id = self.create_open_event(title="Public Gate Exit Guard")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        profile = self.client.get("/api/residents/profile/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        ResidentProfile.objects.filter(user=self.resident).update(is_verified=True)
        self.client.credentials()

        mark = self.client.post(
            "/api/events/gate/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id, "direction": "time_out"},
            format="json",
        )
        self.assertEqual(mark.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(mark.data.get("result_code"), "not_checked_in")

    @override_settings(ALLOW_PUBLIC_GATE=True)
    def test_public_gate_rejects_duplicate_time_out(self):
        event_id = self.create_open_event(title="Public Gate Exit Duplicate")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        profile = self.client.get("/api/residents/profile/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        ResidentProfile.objects.filter(user=self.resident).update(is_verified=True)
        self.client.credentials()

        mark_in = self.client.post(
            "/api/events/gate/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id, "direction": "time_in"},
            format="json",
        )
        self.assertEqual(mark_in.status_code, status.HTTP_201_CREATED)

        mark_out = self.client.post(
            "/api/events/gate/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id, "direction": "time_out"},
            format="json",
        )
        self.assertEqual(mark_out.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mark_out.data.get("result_code"), "time_out")

        duplicate_out = self.client.post(
            "/api/events/gate/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id, "direction": "time_out"},
            format="json",
        )
        self.assertEqual(duplicate_out.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(duplicate_out.data.get("result_code"), "already_timed_out")

    def test_analytics_date_to_includes_same_day_checkins(self):
        event_id = self.create_open_event(title="Analytics Same Day")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        profile = self.client.get("/api/residents/profile/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        ResidentProfile.objects.filter(user=self.resident).update(is_verified=True)

        self.auth(self.admin_token)
        mark = self.client.post(
            "/api/events/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id},
            format="json",
        )
        self.assertEqual(mark.status_code, status.HTTP_201_CREATED)

        latest_attendance = EventAttendance.objects.latest("checked_in_at")
        checkin_day = latest_attendance.checked_in_at.astimezone(timezone.get_current_timezone()).date().isoformat()

        summary = self.client.get(
            f"/api/events/metrics/summary/?date_from={checkin_day}&date_to={checkin_day}"
        )
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(summary.data["kpis"]["total_attendance"], 1)
        self.assertTrue(any(item.get("count", 0) >= 1 for item in summary.data["timeseries"]))

    @override_settings(ALLOW_PUBLIC_GATE=False)
    def test_public_gate_endpoints_require_auth_by_default(self):
        event_id = self.create_open_event(title="Protected Gate Event")

        self.auth(self.res_token)
        reg = self.client.post(f"/api/events/{event_id}/register/")
        self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        profile = self.client.get("/api/residents/profile/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        ResidentProfile.objects.filter(user=self.resident).update(is_verified=True)
        self.client.credentials()

        events = self.client.get("/api/events/gate/events/")
        self.assertIn(events.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

        mark = self.client.post(
            "/api/events/gate/attendance/mark/",
            {"barangay_id": profile.data["barangay_id"], "event_id": event_id, "direction": "time_in"},
            format="json",
        )
        self.assertIn(mark.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_admin_can_archive_ended_event_and_hide_from_default_list(self):
        with override_settings(ARCHIVE_ROOT=Path(self.tempdir.name)), mock_patch.dict("os.environ", {"EVENT_ARCHIVE_STORAGE_BACKEND": "local"}):
            event_id = self.create_open_event(title="Archive Event")

            Event.objects.filter(id=event_id).update(
                status="completed",
                date=timezone.now() - timedelta(days=3),
                end_date=timezone.now() - timedelta(days=2),
            )

            self.auth(self.res_token)
            reg = self.client.post(f"/api/events/{event_id}/register/")
            self.assertIn(reg.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))
            profile = self.client.get("/api/residents/profile/")
            self.assertEqual(profile.status_code, status.HTTP_200_OK)

            self.auth(self.admin_token)
            mark = self.client.post(
                "/api/events/attendance/mark/",
                {"barangay_id": profile.data["barangay_id"], "event_id": event_id},
                format="json",
            )
            self.assertEqual(mark.status_code, status.HTTP_201_CREATED)

            archive = self.client.post(f"/api/events/archive/{event_id}/")
            self.assertEqual(archive.status_code, status.HTTP_200_OK)
            self.assertEqual(archive.data["archive_status"], "archived")
            self.assertEqual(archive.data["archive_storage"], "local")
            archive_path = Path(archive.data["archive_key"])
            self.assertTrue(archive_path.exists())
            archive_payload = archive_path.read_text(encoding="utf-8")
            self.assertIn('"registrations"', archive_payload)
            self.assertIn('"attendance"', archive_payload)
            self.assertIn('"entry_logs"', archive_payload)

            active = self.client.get("/api/events/list/")
            self.assertEqual(active.status_code, status.HTTP_200_OK)
            active_ids = {item["id"] for item in active.data["results"]}
            self.assertNotIn(event_id, active_ids)

            archived = self.client.get("/api/events/list/?archived_only=true")
            self.assertEqual(archived.status_code, status.HTTP_200_OK)
            archived_ids = {item["id"] for item in archived.data["results"]}
            self.assertIn(event_id, archived_ids)

            self.auth(self.res_token)
            reg_again = self.client.post(f"/api/events/{event_id}/register/")
            self.assertEqual(reg_again.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(reg_again.data.get("result_code"), "event_archived")

            self.auth(self.admin_token)
            restore = self.client.post(f"/api/events/unarchive/{event_id}/")
            self.assertEqual(restore.status_code, status.HTTP_200_OK)
            self.assertFalse(restore.data["is_archived"])
