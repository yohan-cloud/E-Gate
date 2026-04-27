from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch as mock_patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .views import ADMIN_UI_DEFAULTS
from common.models import AuditLog
from residents.models import ResidentProfile


@override_settings(
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": (
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ),
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {"user": "10000/min", "anon": "10000/min"},
    }
)
class CommonApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tempdir = TemporaryDirectory()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_common",
            password="pass1234",
            is_admin=True,
            is_staff=True,
        )
        self.gate = User.objects.create_user(
            username="gate_common",
            password="pass1234",
            is_gate_operator=True,
        )
        self.resident = User.objects.create_user(
            username="resident_common",
            password="pass1234",
            first_name="Maria",
            last_name="Santos",
            is_resident=True,
        )
        ResidentProfile.objects.create(
            user=self.resident,
            address="Zone 1",
            birthdate="2000-01-01",
            phone_number="09175550000",
        )

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def tearDown(self):
        self.tempdir.cleanup()

    def test_admin_settings_are_persisted(self):
        self.auth(self.admin)
        res = self.client.get("/api/common/settings/admin-ui/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["value"], ADMIN_UI_DEFAULTS)

        payload = {
            "value": {
                **ADMIN_UI_DEFAULTS,
                "compactTables": True,
                "scannerSound": False,
            }
        }
        res = self.client.put("/api/common/settings/admin-ui/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["value"]["compactTables"])
        self.assertFalse(res.data["value"]["scannerSound"])

    def test_admin_can_create_and_gate_can_view_today_guests(self):
        self.auth(self.admin)
        create = self.client.post(
            "/api/common/guests/",
            {
                "name": "Juan Dela Cruz",
                "organization_company": "Adamson Outreach Team",
                "no_of_participants": 4,
                "contact": "09171234567",
                "purpose": "Document pickup",
                "eta": (timezone.now() + timedelta(hours=1)).isoformat(),
                "status": "expected",
                "notes": "Bring valid ID",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create.data["organization_company"], "Adamson Outreach Team")
        self.assertEqual(create.data["no_of_participants"], 4)

        guest_id = create.data["id"]
        update = self.client.patch(
            f"/api/common/guests/{guest_id}/",
            {"status": "arrived"},
            format="json",
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["status"], "arrived")

        self.auth(self.gate)
        today = self.client.get("/api/common/guests/today/")
        self.assertEqual(today.status_code, status.HTTP_200_OK)
        self.assertEqual(len(today.data), 1)
        self.assertEqual(today.data[0]["status"], "arrived")
        self.assertEqual(today.data[0]["organization_company"], "Adamson Outreach Team")
        self.assertEqual(today.data[0]["no_of_participants"], 4)

    def test_guest_fields_support_organization_search_and_participant_validation(self):
        self.auth(self.admin)
        create = self.client.post(
            "/api/common/guests/",
            {
                "name": "School Visit Team",
                "organization_company": "Adamson University",
                "no_of_participants": 12,
                "contact": "09170000000",
                "purpose": "Campus coordination",
                "eta": timezone.now().isoformat(),
                "status": "expected",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)

        search = self.client.get("/api/common/guests/", {"q": "Adamson"})
        self.assertEqual(search.status_code, status.HTTP_200_OK)
        self.assertEqual(len(search.data), 1)
        self.assertEqual(search.data[0]["organization_company"], "Adamson University")
        self.assertEqual(search.data[0]["no_of_participants"], 12)

        invalid = self.client.post(
            "/api/common/guests/",
            {
                "name": "Invalid Group",
                "organization_company": "Barangay Partner",
                "no_of_participants": 0,
                "contact": "09170000001",
                "purpose": "Outreach",
                "eta": timezone.now().isoformat(),
                "status": "expected",
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no_of_participants", invalid.data)

        invalid_contact = self.client.post(
            "/api/common/guests/",
            {
                "name": "Invalid Contact",
                "organization_company": "Barangay Partner",
                "no_of_participants": 1,
                "contact": "0917ABC0000",
                "purpose": "Outreach",
                "eta": timezone.now().isoformat(),
                "status": "expected",
            },
            format="json",
        )
        self.assertEqual(invalid_contact.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("contact", invalid_contact.data)

        invalid_eta = self.client.post(
            "/api/common/guests/",
            {
                "name": "Past Guest",
                "organization_company": "Barangay Partner",
                "no_of_participants": 1,
                "contact": "09170000002",
                "purpose": "Outreach",
                "eta": (timezone.now() - timedelta(days=1)).isoformat(),
                "status": "expected",
            },
            format="json",
        )
        self.assertEqual(invalid_eta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("eta", invalid_eta.data)

    def test_resident_can_request_and_admin_can_review_appointment(self):
        self.auth(self.resident)
        create = self.client.post(
            "/api/common/resident-appointments/",
            {
                "purpose": "Barangay certificate",
                "appointment_at": (timezone.now() + timedelta(days=1)).isoformat(),
                "resident_note": "Need it for school requirements.",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create.data["status"], "pending")
        self.assertEqual(create.data["resident_name"], "Maria Santos")

        appointment_id = create.data["id"]
        self.auth(self.admin)
        review = self.client.patch(
            f"/api/common/resident-appointments/{appointment_id}/",
            {
                "status": "approved",
                "admin_note": "Bring a valid ID.",
                "appointment_at": (timezone.now() + timedelta(days=2)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(review.status_code, status.HTTP_200_OK)
        self.assertEqual(review.data["status"], "approved")
        self.assertIn("approved", review.data["admin_note"])
        self.assertIn("Bring a valid ID.", review.data["admin_note"])
        self.assertEqual(review.data["reviewed_by_name"], self.admin.username)

        self.auth(self.resident)
        mine = self.client.get("/api/common/resident-appointments/")
        self.assertEqual(mine.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mine.data), 1)
        self.assertEqual(mine.data[0]["status"], "approved")

    def test_resident_can_change_active_appointment_for_review(self):
        self.auth(self.resident)
        create = self.client.post(
            "/api/common/resident-appointments/",
            {
                "purpose": "Barangay certificate",
                "appointment_at": (timezone.now() + timedelta(days=1)).isoformat(),
            },
            format="json",
        )
        appointment_id = create.data["id"]

        self.auth(self.admin)
        review = self.client.patch(
            f"/api/common/resident-appointments/{appointment_id}/",
            {
                "status": "approved",
                "admin_note": "Bring a valid ID.",
            },
            format="json",
        )
        self.assertEqual(review.status_code, status.HTTP_200_OK)
        self.assertEqual(review.data["status"], "approved")
        self.assertEqual(review.data["reviewed_by_name"], self.admin.username)

        self.auth(self.resident)
        change = self.client.patch(
            f"/api/common/resident-appointments/{appointment_id}/",
            {
                "purpose": "Barangay certificate pickup",
                "appointment_at": (timezone.now() + timedelta(days=3)).isoformat(),
                "resident_note": "Requesting a later schedule.",
            },
            format="json",
        )

        self.assertEqual(change.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(change.data["error"], "This appointment can no longer be changed.")

    def test_resident_can_only_cancel_pending_appointment(self):
        self.auth(self.resident)
        create = self.client.post(
            "/api/common/resident-appointments/",
            {
                "purpose": "Barangay certificate",
                "appointment_at": (timezone.now() + timedelta(days=1)).isoformat(),
            },
            format="json",
        )
        appointment_id = create.data["id"]

        self.auth(self.admin)
        review = self.client.patch(
            f"/api/common/resident-appointments/{appointment_id}/",
            {"status": "approved", "admin_note": "Approved by admin."},
            format="json",
        )
        self.assertEqual(review.status_code, status.HTTP_200_OK)

        self.auth(self.resident)
        cancel = self.client.patch(
            f"/api/common/resident-appointments/{appointment_id}/",
            {"status": "cancelled"},
            format="json",
        )
        self.assertEqual(cancel.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(cancel.data["error"], "This appointment can no longer be cancelled.")

    def test_admin_can_create_resident_appointment_for_resident(self):
        self.auth(self.admin)
        create = self.client.post(
            "/api/common/resident-appointments/",
            {
                "resident": self.resident.id,
                "purpose": "Senior citizen record update",
                "appointment_at": (timezone.now() + timedelta(days=1)).isoformat(),
                "status": "pending",
                "admin_note": "Admin assisted booking.",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create.data["resident"], self.resident.id)
        self.assertEqual(create.data["status"], "approved")
        self.assertEqual(create.data["reviewed_by_name"], self.admin.username)

        self.auth(self.resident)
        mine = self.client.get("/api/common/resident-appointments/")
        self.assertEqual(mine.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mine.data), 1)
        self.assertEqual(mine.data[0]["purpose"], "Senior citizen record update")

    def test_admin_can_reject_pending_resident_appointment_with_note(self):
        self.auth(self.resident)
        create = self.client.post(
            "/api/common/resident-appointments/",
            {
                "purpose": "Barangay certificate",
                "appointment_at": (timezone.now() + timedelta(days=1)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)

        self.auth(self.admin)
        review = self.client.patch(
            f"/api/common/resident-appointments/{create.data['id']}/",
            {
                "status": "rejected",
                "admin_note": "Please complete your resident profile first.",
            },
            format="json",
        )
        self.assertEqual(review.status_code, status.HTTP_200_OK)
        self.assertEqual(review.data["status"], "rejected")
        self.assertIn("rejected", review.data["admin_note"])
        self.assertIn("Please complete your resident profile first.", review.data["admin_note"])

    def test_guest_list_all_is_not_implicitly_limited_to_today(self):
        with override_settings(ARCHIVE_ROOT=Path(self.tempdir.name)):
            self.auth(self.admin)
            today_eta = timezone.now() + timedelta(hours=1)
            future_eta = timezone.now() + timedelta(days=2)
            self.client.post(
                "/api/common/guests/",
                {
                    "name": "Today Guest",
                    "contact": "09171234560",
                    "purpose": "Today visit",
                    "eta": today_eta.isoformat(),
                    "status": "expected",
                },
                format="json",
            )
            self.client.post(
                "/api/common/guests/",
                {
                    "name": "Future Guest",
                    "contact": "09171234561",
                    "purpose": "Future visit",
                    "eta": future_eta.isoformat(),
                    "status": "expected",
                },
                format="json",
            )

            res = self.client.get("/api/common/guests/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            names = {item["name"] for item in res.data}
            self.assertEqual(names, {"Today Guest", "Future Guest"})

    def test_guest_archive_writes_snapshot_and_hides_from_default_list(self):
        with override_settings(ARCHIVE_ROOT=Path(self.tempdir.name)), mock_patch.dict("os.environ", {"ARCHIVE_STORAGE_BACKEND": "local"}):
            self.auth(self.admin)
            create = self.client.post(
                "/api/common/guests/",
                {
                    "name": "Archive Me",
                    "contact": "09171234562",
                    "purpose": "Records retention",
                    "eta": (timezone.now() + timedelta(hours=4)).isoformat(),
                    "status": "expected",
                    "notes": "Needs archival",
                },
                format="json",
            )
            self.assertEqual(create.status_code, status.HTTP_201_CREATED)
            guest_id = create.data["id"]

            archive = self.client.post(f"/api/common/guests/{guest_id}/archive/")
            self.assertEqual(archive.status_code, status.HTTP_200_OK)
            self.assertEqual(archive.data["archive_status"], "archived")
            self.assertEqual(archive.data["archive_storage"], "local")
            archive_path = Path(archive.data["archive_key"])
            self.assertTrue(archive_path.exists())
            archive_payload = archive_path.read_text(encoding="utf-8")
            self.assertIn('"scan_logs"', archive_payload)
            self.assertIn('"archive_status_before": "active"', archive_payload)

            active = self.client.get("/api/common/guests/")
            self.assertEqual(active.status_code, status.HTTP_200_OK)
            self.assertEqual(active.data, [])

            archived = self.client.get("/api/common/guests/", {"archived_only": "true"})
            self.assertEqual(archived.status_code, status.HTTP_200_OK)
            self.assertEqual(len(archived.data), 1)
            self.assertTrue(archived.data[0]["is_archived"])

            patch = self.client.patch(
                f"/api/common/guests/{guest_id}/",
                {"purpose": "Changed"},
                format="json",
            )
            self.assertEqual(patch.status_code, status.HTTP_400_BAD_REQUEST)

            unarchive = self.client.post(f"/api/common/guests/{guest_id}/unarchive/")
            self.assertEqual(unarchive.status_code, status.HTTP_200_OK)
            self.assertFalse(unarchive.data["is_archived"])
            self.assertEqual(unarchive.data["archive_status"], "active")

            active_again = self.client.get("/api/common/guests/")
            self.assertEqual(active_again.status_code, status.HTTP_200_OK)
            self.assertEqual(len(active_again.data), 1)

            archived_again = self.client.get("/api/common/guests/", {"archived_only": "true"})
            self.assertEqual(archived_again.status_code, status.HTTP_200_OK)
            self.assertEqual(archived_again.data, [])

    def test_guest_scan_check_in_and_check_out_flow(self):
        self.auth(self.admin)
        create = self.client.post(
            "/api/common/guests/",
            {
                "name": "Guest QR",
                "contact": "09171230000",
                "purpose": "Meeting",
                "eta": timezone.now().isoformat(),
                "status": "expected",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        token = create.data["qr_token"]

        self.client.force_authenticate(user=None)
        check_in = self.client.post(
            "/api/common/guests/gate/scan/",
            {"token": token, "direction": "time_in"},
            format="json",
        )
        self.assertEqual(check_in.status_code, status.HTTP_201_CREATED)
        self.assertEqual(check_in.data["result_code"], "checked_in")

        check_out = self.client.post(
            "/api/common/guests/gate/scan/",
            {"token": token, "direction": "time_out"},
            format="json",
        )
        self.assertEqual(check_out.status_code, status.HTTP_201_CREATED)
        self.assertEqual(check_out.data["result_code"], "checked_out")

        logs = self.client.get("/api/common/guests/gate/logs/")
        self.assertEqual(logs.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(logs.data), 2)

    def test_guest_scan_rejects_cancelled_or_reused_qr(self):
        self.auth(self.admin)
        create = self.client.post(
            "/api/common/guests/",
            {
                "name": "Cancelled Guest",
                "contact": "09171230001",
                "purpose": "Delivery",
                "eta": timezone.now().isoformat(),
                "status": "cancelled",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=None)
        cancelled = self.client.post(
            "/api/common/guests/gate/scan/",
            {"token": create.data["qr_token"], "direction": "time_in"},
            format="json",
        )
        self.assertEqual(cancelled.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(cancelled.data["result_code"], "cancelled")

        self.auth(self.admin)
        create2 = self.client.post(
            "/api/common/guests/",
            {
                "name": "Used Guest",
                "contact": "09171230002",
                "purpose": "Pickup",
                "eta": timezone.now().isoformat(),
                "status": "expected",
            },
            format="json",
        )
        self.assertEqual(create2.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=None)
        first = self.client.post(
            "/api/common/guests/gate/scan/",
            {"token": create2.data["qr_token"], "direction": "time_in"},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        reused = self.client.post(
            "/api/common/guests/gate/scan/",
            {"token": create2.data["qr_token"], "direction": "time_in"},
            format="json",
        )
        self.assertEqual(reused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(reused.data["result_code"], "already_used")

    def test_admin_manual_guest_override_can_check_in_and_out(self):
        self.auth(self.admin)
        create = self.client.post(
            "/api/common/guests/",
            {
                "name": "Manual Guest",
                "contact": "09171230003",
                "purpose": "Late arrival",
                "eta": (timezone.now() + timedelta(hours=1)).isoformat(),
                "status": "expected",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        guest_id = create.data["id"]

        manual_in = self.client.post(
            f"/api/common/guests/{guest_id}/manual-scan/",
            {"direction": "time_in"},
            format="json",
        )
        self.assertEqual(manual_in.status_code, status.HTTP_201_CREATED)
        self.assertEqual(manual_in.data["result_code"], "checked_in")

        manual_out = self.client.post(
            f"/api/common/guests/{guest_id}/manual-scan/",
            {"direction": "time_out"},
            format="json",
        )
        self.assertEqual(manual_out.status_code, status.HTTP_201_CREATED)
        self.assertEqual(manual_out.data["result_code"], "checked_out")

    def test_gate_lookup_returns_today_and_upcoming_appointments(self):
        self.auth(self.admin)
        self.client.post(
            "/api/common/guests/",
            {
                "name": "Today Lookup",
                "contact": "09171230004",
                "purpose": "Appointment today",
                "eta": timezone.now().isoformat(),
                "status": "expected",
            },
            format="json",
        )
        self.client.post(
            "/api/common/guests/",
            {
                "name": "Future Lookup",
                "contact": "09171230005",
                "purpose": "Appointment later",
                "eta": (timezone.now() + timedelta(days=2)).isoformat(),
                "status": "expected",
            },
            format="json",
        )

        self.auth(self.gate)
        res = self.client.get("/api/common/guests/gate/lookup/?q=Lookup")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in res.data}
        self.assertEqual(names, {"Today Lookup", "Future Lookup"})

    def test_gate_manual_guest_scan_uses_today_lookup(self):
        self.auth(self.admin)
        create = self.client.post(
            "/api/common/guests/",
            {
                "name": "Gate Manual Guest",
                "contact": "09171230006",
                "purpose": "Manual gate validation",
                "eta": timezone.now().isoformat(),
                "status": "expected",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)

        self.auth(self.gate)
        manual_in = self.client.post(
            "/api/common/guests/gate/manual-scan/",
            {"appointment_id": create.data["id"], "direction": "time_in"},
            format="json",
        )
        self.assertEqual(manual_in.status_code, status.HTTP_201_CREATED)
        self.assertEqual(manual_in.data["result_code"], "checked_in")

    def test_admin_can_filter_audit_logs(self):
        AuditLog.objects.create(
            actor=self.admin,
            action="resident_update",
            target_type="resident",
            target_id="2",
            target_label="Juana Dela Cruz",
            metadata={"resident_name": "Juana Dela Cruz", "resident_user_id": 2},
        )
        AuditLog.objects.create(
            actor=self.gate,
            action="attendance_mark",
            target_type="event_attendance",
            target_id="9",
            target_label="Resident Gate Entry",
            metadata={"resident_name": "Michael Acebedo", "resident_user_id": 9},
        )

        self.auth(self.admin)

        res = self.client.get("/api/common/audit-logs/", {"action": "resident_update"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["actor_username"], "admin_common")

        res = self.client.get("/api/common/audit-logs/", {"resident": "Michael"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["action"], "attendance_mark")

        res = self.client.get("/api/common/audit-logs/", {"actor": "admin_common"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["action"], "resident_update")

    def test_admin_can_create_another_admin_account(self):
        self.auth(self.admin)
        res = self.client.post(
            "/api/accounts/register/admin/",
            {
                "username": "second_admin",
                "email": "second@example.com",
                "password": "StrongPass123!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["user"]["username"], "second_admin")
        self.assertTrue(AuditLog.objects.filter(action="admin_create", target_label="second_admin").exists())
