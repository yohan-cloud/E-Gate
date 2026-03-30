from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from common.models import AuditLog
from events.models import Event, EventRegistration
from residents.models import ResidentProfile, VerificationRequest


@override_settings(
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": (
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ),
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {"user": "10000/min", "anon": "10000/min"},
    }
)
class ResidentSecurityAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_security",
            password="pass1234",
            is_admin=True,
            is_staff=True,
            first_name="Admin",
            last_name="User",
        )
        self.resident = User.objects.create_user(
            username="resident_one",
            password="pass1234",
            is_resident=True,
            email="resident@example.com",
            first_name="Juana",
            last_name="Dela Cruz",
        )
        self.profile = ResidentProfile.objects.create(
            user=self.resident,
            address="Manila City",
            birthdate="2000-01-01",
            phone_number="09123456789",
            gender=ResidentProfile.Gender.FEMALE,
            is_verified=True,
            verified_at=timezone.now(),
        )
        self.event = Event.objects.create(
            title="Barangay Assembly",
            description="Monthly assembly",
            event_type="community_events",
            date=timezone.now() + timedelta(days=1),
            venue="Hall",
            status="upcoming",
            created_by=self.admin,
        )
        self.registration = EventRegistration.objects.create(event=self.event, resident=self.resident)

    def auth_admin(self):
        self.client.force_authenticate(user=self.admin)

    def test_resident_list_masks_sensitive_fields_but_detail_reveals_them(self):
        self.auth_admin()

        list_res = self.client.get("/api/residents/list/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data), 1)
        row = list_res.data[0]
        self.assertNotEqual(row["user"]["email"], "resident@example.com")
        self.assertIn("*", row["user"]["email"])
        self.assertNotEqual(row["phone_number"], "09123456789")
        self.assertIn("*", row["phone_number"])
        self.assertNotEqual(row["address"], "Manila City")
        self.assertIn("*", row["address"])
        self.assertFalse(row["sensitive_revealed"])

        detail_res = self.client.get(f"/api/residents/admin/{self.resident.id}/")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_res.data["user"]["email"], "resident@example.com")
        self.assertEqual(detail_res.data["phone_number"], "09123456789")
        self.assertTrue(detail_res.data["sensitive_revealed"])

    def test_resident_actions_create_audit_logs(self):
        self.auth_admin()

        self.client.get("/api/residents/list/", {"q": "resident"})
        self.client.get(f"/api/residents/admin/{self.resident.id}/", {"reason": "reveal_sensitive"})
        update_res = self.client.patch(
            f"/api/residents/admin/{self.resident.id}/",
            {"phone_number": "09999888777", "address": "Ermita, Manila"},
            format="json",
        )
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)

        actions = list(AuditLog.objects.values_list("action", flat=True))
        self.assertIn("resident_list_view", actions)
        self.assertIn("resident_sensitive_reveal", actions)
        self.assertIn("resident_update", actions)

        update_log = AuditLog.objects.filter(action="resident_update").latest("id")
        self.assertEqual(update_log.target_id, str(self.resident.id))
        self.assertEqual(update_log.metadata["barangay_id"], str(self.profile.barangay_id))
        self.assertIn("phone_number", update_log.metadata["changed_fields"])

    def test_login_attendance_and_verification_review_are_audited(self):
        login_client = APIClient()
        login_res = login_client.post(
            "/api/accounts/login/admin/",
            {"username": "admin_security", "password": "pass1234"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertTrue(AuditLog.objects.filter(action="login_success", target_id=str(self.admin.id)).exists())

        self.auth_admin()
        attendance_res = self.client.post(
            "/api/events/attendance/mark/",
            {"event_id": self.event.id, "username": self.resident.username},
            format="json",
        )
        self.assertEqual(attendance_res.status_code, status.HTTP_201_CREATED)
        attendance_log = AuditLog.objects.filter(action="attendance_mark", target_type="event_attendance").latest("id")
        self.assertEqual(attendance_log.metadata["method"], "qr")
        self.assertEqual(attendance_log.metadata["direction"], "time_in")

        verification = VerificationRequest.objects.create(user=self.resident, document="verifications/test.pdf")
        review_res = self.client.post(
            f"/api/residents/verification/admin/{verification.id}/",
            {"action": "approved", "admin_note": "Documents matched."},
            format="json",
        )
        self.assertEqual(review_res.status_code, status.HTTP_200_OK)
        verification_log = AuditLog.objects.filter(action="verification_review").latest("id")
        self.assertEqual(verification_log.target_id, str(verification.id))
        self.assertEqual(verification_log.metadata["status"], "approved")
