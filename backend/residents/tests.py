from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch as mock_patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from common.models import AuditLog
from events.models import Event, EventRegistration
from residents.models import ResidentProfile, VerificationRequest


def make_verification_upload(name="verification.jpg"):
    return SimpleUploadedFile(name, b"fake-image-content", content_type="image/jpeg")


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
        self.tempdir = TemporaryDirectory()
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
            resident_category=ResidentProfile.ResidentCategory.RESIDENT,
            voter_status=ResidentProfile.VoterStatus.UNSPECIFIED,
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

    def tearDown(self):
        self.tempdir.cleanup()

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
        self.assertEqual(detail_res.data["resident_category"], ResidentProfile.ResidentCategory.RESIDENT)
        self.assertEqual(detail_res.data["voter_status"], ResidentProfile.VoterStatus.UNSPECIFIED)
        self.assertTrue(detail_res.data["sensitive_revealed"])

    def test_resident_actions_create_audit_logs(self):
        self.auth_admin()

        self.client.get("/api/residents/list/", {"q": "resident"})
        self.client.get(f"/api/residents/admin/{self.resident.id}/", {"reason": "reveal_sensitive"})
        update_res = self.client.patch(
            f"/api/residents/admin/{self.resident.id}/",
            {
                "phone_number": "09999888777",
                "address": "Ermita, Manila",
                "resident_category": ResidentProfile.ResidentCategory.CLIENT,
                "voter_status": ResidentProfile.VoterStatus.REGISTERED_VOTER,
            },
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
        self.assertIn("resident_category", update_log.metadata["changed_fields"])
        self.assertIn("voter_status", update_log.metadata["changed_fields"])

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

    def test_resident_archive_excludes_biometric_data_and_hides_from_active_list(self):
        with override_settings(ARCHIVE_ROOT=Path(self.tempdir.name)), mock_patch.dict("os.environ", {"RESIDENT_ARCHIVE_STORAGE_BACKEND": "local"}):
            self.auth_admin()
            self.profile.face_embedding = [0.1, 0.2, 0.3]
            self.profile.face_image = "faces/example.jpg"
            self.profile.save(update_fields=["face_embedding", "face_image", "face_updated_at"])

            archive = self.client.post(f"/api/residents/admin/{self.resident.id}/archive/")
            self.assertEqual(archive.status_code, status.HTTP_200_OK)
            self.assertEqual(archive.data["archive_status"], "archived")
            archive_path = Path(archive.data["archive_key"])
            self.assertTrue(archive_path.exists())
            archive_payload = archive_path.read_text(encoding="utf-8")
            self.assertIn('"has_face_enrollment": true', archive_payload)
            self.assertIn('"biometric_data_archived": false', archive_payload)
            self.assertNotIn("face_embedding", archive_payload)
            self.assertNotIn("face_image", archive_payload)

            active = self.client.get("/api/residents/list/")
            self.assertEqual(active.status_code, status.HTTP_200_OK)
            self.assertEqual(active.data, [])

            archived = self.client.get("/api/residents/list/", {"archived_only": "true"})
            self.assertEqual(archived.status_code, status.HTTP_200_OK)
            self.assertEqual(len(archived.data), 1)
            self.assertTrue(archived.data[0]["is_archived"])

            unarchive = self.client.post(f"/api/residents/admin/{self.resident.id}/unarchive/")
            self.assertEqual(unarchive.status_code, status.HTTP_200_OK)
            self.assertFalse(unarchive.data["is_archived"])

    def test_resident_deactivation_moves_resident_to_deactivated_filter_and_blocks_resident_access(self):
        self.auth_admin()

        deactivate = self.client.post(
            f"/api/residents/admin/{self.resident.id}/deactivate/",
            {"reason": "Requested account deactivation"},
            format="json",
        )
        self.assertEqual(deactivate.status_code, status.HTTP_200_OK)
        self.assertTrue(deactivate.data["is_deactivated"])
        self.assertEqual(deactivate.data["deactivation_reason"], "Requested account deactivation")

        active = self.client.get("/api/residents/list/")
        self.assertEqual(active.status_code, status.HTTP_200_OK)
        self.assertEqual(active.data, [])

        deactivated = self.client.get("/api/residents/list/", {"deactivated_only": "true"})
        self.assertEqual(deactivated.status_code, status.HTTP_200_OK)
        self.assertEqual(len(deactivated.data), 1)
        self.assertTrue(deactivated.data[0]["is_deactivated"])

        resident_client = APIClient()
        self.resident.refresh_from_db()
        resident_client.force_authenticate(user=self.resident)
        profile_res = resident_client.get("/api/residents/profile/")
        self.assertEqual(profile_res.status_code, status.HTTP_403_FORBIDDEN)

        reactivate = self.client.post(f"/api/residents/admin/{self.resident.id}/reactivate/")
        self.assertEqual(reactivate.status_code, status.HTTP_200_OK)
        self.assertFalse(reactivate.data["is_deactivated"])

    def test_admin_password_reset_and_resident_password_change_are_audited(self):
        self.auth_admin()
        reset_res = self.client.post(
            f"/api/residents/admin/{self.resident.id}/reset-password/",
            {"temporary_password": "TempAudit!234"},
            format="json",
        )
        self.assertEqual(reset_res.status_code, status.HTTP_200_OK)

        login_client = APIClient()
        login_res = login_client.post(
            "/api/accounts/login/resident/",
            {"username": "resident_one", "password": "TempAudit!234"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        access = login_res.data["tokens"]["access"]

        login_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        change_res = login_client.post(
            "/api/residents/change-password/",
            {"current_password": "TempAudit!234", "new_password": "NewAudit!234"},
            format="json",
        )
        self.assertEqual(change_res.status_code, status.HTTP_200_OK)

        actions = list(AuditLog.objects.values_list("action", flat=True))
        self.assertIn("resident_password_reset", actions)
        self.assertIn("resident_password_change", actions)


@override_settings(
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": (
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ),
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {"user": "10000/min", "anon": "10000/min"},
    }
)
class ResidentReverificationFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_reverify",
            password="pass1234",
            is_admin=True,
            is_staff=True,
        )
        self.resident = User.objects.create_user(
            username="resident_reverify",
            password="pass1234",
            is_resident=True,
            email="resident_reverify@example.com",
        )
        self.profile = ResidentProfile.objects.create(
            user=self.resident,
            address="Ermita, Manila",
            birthdate="2000-01-01",
            phone_number="09120000000",
            is_verified=True,
            verified_at=timezone.now() - timedelta(days=400),
            date_registered=timezone.localdate() - timedelta(days=400),
            expiry_date=timezone.localdate() - timedelta(days=1),
        )

    def test_expired_verified_resident_can_submit_reverification_request(self):
        self.client.force_authenticate(user=self.resident)

        res = self.client.post(
            "/api/residents/verification/",
            {"document": make_verification_upload(), "note": "Renewing expired ID."},
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], "pending")
        self.assertEqual(res.data["request_kind"], "reverification")
        self.assertTrue(res.data["is_expired"])

    def test_active_verified_resident_cannot_submit_reverification_request_early(self):
        self.profile.expiry_date = timezone.localdate() + timedelta(days=30)
        self.profile.save(update_fields=["expiry_date"])
        self.client.force_authenticate(user=self.resident)

        res = self.client.post(
            "/api/residents/verification/",
            {"document": make_verification_upload()},
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("still active", res.data["error"])

    def test_admin_approval_of_expired_reverification_renews_expiry(self):
        verification = VerificationRequest.objects.create(
            user=self.resident,
            document=make_verification_upload("expired-renew.jpg"),
        )
        old_expiry = self.profile.expiry_date
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(
            f"/api/residents/verification/admin/{verification.id}/",
            {"action": "approved", "admin_note": "Expired ID renewed."},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        verification.refresh_from_db()
        self.assertTrue(self.profile.is_verified)
        self.assertEqual(verification.status, VerificationRequest.Status.APPROVED)
        self.assertGreater(self.profile.expiry_date, old_expiry)
        self.assertEqual(self.profile.expiry_date, timezone.localdate() + timedelta(days=365))

        review_log = AuditLog.objects.filter(action="verification_review").latest("id")
        self.assertEqual(review_log.metadata["request_kind"], "reverification")
        self.assertTrue(review_log.metadata["expiry_renewed"])
