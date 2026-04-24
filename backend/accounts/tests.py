from django.test import TestCase, override_settings
from django.core import mail
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils.datastructures import MultiValueDict
from io import BytesIO
from PIL import Image
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch
from types import SimpleNamespace

from accounts.face_utils import HAS_FACE_LIB, get_image_match_threshold, match_embedding
from accounts.models import PasswordResetCode
from accounts.serializers import ResidentRegisterSerializer
from residents.models import ResidentProfile, VerificationRequest


def make_test_image(name="sample.jpg", color=(120, 120, 120)):
    buffer = BytesIO()
    image = Image.new("RGB", (8, 8), color=color)
    image.save(buffer, format="JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


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
class AccountsFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_for_tests",
            password="AdminFlow!234",
            is_admin=True,
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    def test_admin_register_and_login(self):
        # Register admin
        res = self.client.post(
            "/api/accounts/register/admin/",
            {"username": "admin_test", "password": "AdminFlow!234", "email": "a@b.com"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(user=None)

        # Login admin
        res = self.client.post(
            "/api/accounts/login/admin/",
            {"username": "admin_test", "password": "AdminFlow!234"},
            format="json",
        )
        if res.status_code != status.HTTP_200_OK:
            self.fail(f"Admin login failed: {res.status_code} {getattr(res, 'data', None)}")
        tokens = res.data.get("tokens", {})
        self.assertIn("access", tokens)
        self.assertIn("refresh", tokens)

    def test_admin_can_register_gate_operator_and_gate_operator_can_login(self):
        res = self.client.post(
            "/api/accounts/register/gate-operator/",
            {
                "full_name": "Gate Test",
                "username": "gate_test",
                "password": "GateFlow!234",
                "email": "gate@example.com",
                "contact_number": "09171234560",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["user"]["is_gate_operator"])
        self.assertEqual(res.data["user"]["full_name"], "Gate Test")
        self.assertEqual(res.data["user"]["contact_number"], "09171234560")

        self.client.force_authenticate(user=None)
        res = self.client.post(
            "/api/accounts/login/admin/",
            {"username": "gate_test", "password": "GateFlow!234"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("meta", {}).get("role"), "GateOperator")
        tokens = res.data.get("tokens", {})
        self.assertIn("access", tokens)
        self.assertIn("refresh", tokens)

    def test_unified_login_routes_admin_to_administrator_role(self):
        self.client.force_authenticate(user=None)
        res = self.client.post(
            "/api/accounts/login/",
            {"username": "admin_for_tests", "password": "AdminFlow!234"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("meta", {}).get("role"), "Administrator")

    def test_unified_login_routes_gate_operator_to_gate_role(self):
        self.client.post(
            "/api/accounts/register/gate-operator/",
            {
                "full_name": "Gate Unified",
                "username": "gate_unified",
                "password": "GateFlow!234",
                "email": "gate-unified@example.com",
                "contact_number": "09171234561",
            },
            format="json",
        )
        self.client.force_authenticate(user=None)
        res = self.client.post(
            "/api/accounts/login/",
            {"username": "gate_unified", "password": "GateFlow!234"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("meta", {}).get("role"), "GateOperator")

    def test_admin_can_list_manage_and_delete_gate_operator(self):
        create_res = self.client.post(
            "/api/accounts/register/gate-operator/",
            {
                "full_name": "Gate Manage",
                "username": "gate_manage",
                "password": "GateFlow!234",
                "email": "gate-manage@example.com",
                "contact_number": "09171234562",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        gate_id = create_res.data["user"]["id"]

        list_res = self.client.get("/api/accounts/gate-operators/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertTrue(any(row["username"] == "gate_manage" for row in list_res.data))
        managed_row = next(row for row in list_res.data if row["username"] == "gate_manage")
        self.assertEqual(managed_row["full_name"], "Gate Manage")
        self.assertEqual(managed_row["contact_number"], "09171234562")

        reset_res = self.client.post(
            f"/api/accounts/gate-operators/{gate_id}/reset-password/",
            {"temporary_password": "TemporaryGate!234"},
            format="json",
        )
        self.assertEqual(reset_res.status_code, status.HTTP_200_OK)

        deactivate_res = self.client.post(
            f"/api/accounts/gate-operators/{gate_id}/set-active/",
            {"is_active": False, "reason": "Left gate operations"},
            format="json",
        )
        self.assertEqual(deactivate_res.status_code, status.HTTP_200_OK)
        self.assertFalse(get_user_model().objects.get(id=gate_id).is_active)

        reactivate_res = self.client.post(
            f"/api/accounts/gate-operators/{gate_id}/set-active/",
            {"is_active": True},
            format="json",
        )
        self.assertEqual(reactivate_res.status_code, status.HTTP_200_OK)
        self.assertTrue(get_user_model().objects.get(id=gate_id).is_active)

        delete_res = self.client.delete(f"/api/accounts/gate-operators/{gate_id}/delete/")
        self.assertEqual(delete_res.status_code, status.HTTP_200_OK)
        self.assertFalse(get_user_model().objects.filter(id=gate_id).exists())

    def test_resident_register_and_login(self):
        # Authenticate as admin to register a resident
        self.client.force_authenticate(user=self.admin)
        # Register resident
        res = self.client.post(
            "/api/accounts/register/resident/",
            {
                "username": "res_test",
                "password": "ResidentFlow!234",
                "email": "res_test@example.com",
                "address": "Block 1 Lot 2",
                "birthdate": "2000-01-01",
                "phone_number": "09171234567",
                "resident_category": "client",
                "voter_status": "registered_voter",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        profile = ResidentProfile.objects.select_related("user").get(user__username="res_test")
        self.assertTrue(profile.is_verified)
        self.assertIsNotNone(profile.verified_at)
        self.assertEqual(profile.resident_category, ResidentProfile.ResidentCategory.CLIENT)
        self.assertEqual(profile.voter_status, ResidentProfile.VoterStatus.REGISTERED_VOTER)
        self.assertTrue(res.data["user"]["is_verified"])
        # Clear admin auth before resident login
        self.client.force_authenticate(user=None)

        # Login resident
        res = self.client.post(
            "/api/accounts/login/resident/",
            {"username": "res_test", "password": "ResidentFlow!234"},
            format="json",
        )
        if res.status_code != status.HTTP_200_OK:
            self.fail(f"Resident login failed: {res.status_code} {getattr(res, 'data', None)}")
        tokens = res.data.get("tokens", {})
        self.assertIn("access", tokens)
        self.assertIn("refresh", tokens)

    def test_resident_login_accepts_case_insensitive_username(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            "/api/accounts/register/resident/",
            {
                "username": "MiguelAndrei",
                "password": "ResidentFlow!234",
                "email": "miguelandrei@example.com",
                "address": "Block 1 Lot 2",
                "birthdate": "2000-01-01",
                "phone_number": "09171234560",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(user=None)

        res = self.client.post(
            "/api/accounts/login/resident/",
            {"username": "miguelandrei", "password": "ResidentFlow!234"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data.get("tokens", {}))

    def test_unified_login_routes_resident_to_resident_role(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            "/api/accounts/register/resident/",
            {
                "username": "res_unified",
                "password": "ResidentFlow!234",
                "email": "res_unified@example.com",
                "address": "Block 3 Lot 4",
                "birthdate": "2000-01-01",
                "phone_number": "09171234564",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(user=None)

        res = self.client.post(
            "/api/accounts/login/",
            {"username": "res_unified", "password": "ResidentFlow!234"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("meta", {}).get("role"), "Resident")

    def test_deactivated_resident_cannot_log_in(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            "/api/accounts/register/resident/",
            {
                "username": "res_deactivated",
                "password": "ResidentFlow!234",
                "email": "res_deactivated@example.com",
                "address": "Block 1 Lot 2",
                "birthdate": "2000-01-01",
                "phone_number": "09171234562",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        resident = get_user_model().objects.get(username="res_deactivated")

        deactivate_res = self.client.post(
            f"/api/residents/admin/{resident.id}/deactivate/",
            {"reason": "Moved out of barangay"},
            format="json",
        )
        self.assertEqual(deactivate_res.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=None)
        login_res = self.client.post(
            "/api/accounts/login/resident/",
            {"username": "res_deactivated", "password": "ResidentFlow!234"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_created_resident_starts_auto_verified(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            "/api/accounts/register/resident/",
            {
                "username": "res_auto_verified",
                "password": "ResidentFlow!234",
                "email": "res_auto_verified@example.com",
                "address": "Block 7 Lot 8",
                "birthdate": "2001-02-03",
                "phone_number": "09171234561",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        profile = ResidentProfile.objects.select_related("user").get(user__username="res_auto_verified")
        self.assertTrue(profile.is_verified)
        self.assertIsNotNone(profile.verified_at)

    def test_resident_register_collects_id_document_as_approved_verification(self):
        self.client.force_authenticate(user=self.admin)
        id_document = make_test_image("resident-id.jpg", color=(10, 90, 160))
        res = self.client.post(
            "/api/accounts/register/resident/",
            {
                "username": "res_with_id_doc",
                "password": "ResidentFlow!234",
                "email": "res_with_id_doc@example.com",
                "address": "Block 9 Lot 1",
                "birthdate": "2001-02-03",
                "phone_number": "09171234563",
                "id_document": id_document,
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        verification = VerificationRequest.objects.select_related("user", "reviewed_by").get(
            user__username="res_with_id_doc"
        )
        self.assertEqual(verification.status, VerificationRequest.Status.APPROVED)
        self.assertEqual(verification.reviewed_by, self.admin)
        self.assertTrue(verification.document.name)

    def test_resident_register_requires_email(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            "/api/accounts/register/resident/",
            {
                "username": "res_missing_email",
                "password": "ResidentFlow!234",
                "address": "Block 1 Lot 2",
                "birthdate": "2000-01-01",
                "phone_number": "09171234568",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", res.data)

    @patch("accounts.serializers.average_embeddings")
    @patch("accounts.serializers.extract_embedding")
    def test_resident_register_averages_multiple_face_samples(self, mock_extract_embedding, mock_average_embeddings):
        mock_extract_embedding.side_effect = [
            [0.10, 0.20, 0.30],
            [0.20, 0.30, 0.40],
            [0.30, 0.40, 0.50],
        ]
        mock_average_embeddings.return_value = [0.2, 0.3, 0.4]
        request = SimpleNamespace(
            FILES=MultiValueDict(
                {
                    "face_images": [
                        make_test_image("sample1.jpg", color=(100, 110, 120)),
                        make_test_image("sample2.jpg", color=(110, 120, 130)),
                        make_test_image("sample3.jpg", color=(120, 130, 140)),
                    ]
                }
            )
        )
        serializer = ResidentRegisterSerializer(
            data={
                "username": "res_face_multi",
                "password": "ResidentFlow!234",
                "email": "res_face_multi@example.com",
                "address": "Block 1 Lot 2",
                "birthdate": "2000-01-01",
                "phone_number": "09171234569",
            },
            context={"request": request},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        profile = ResidentProfile.objects.select_related("user").get(user__username="res_face_multi")
        self.assertEqual(profile.user_id, user.id)
        self.assertEqual(profile.face_embedding, [0.2, 0.3, 0.4])
        self.assertTrue(bool(profile.face_image))
        self.assertEqual(mock_extract_embedding.call_count, 3)
        mock_average_embeddings.assert_called_once()


class FaceMatchingTests(TestCase):
    def test_image_match_threshold_is_stricter_for_single_candidate(self):
        self.assertEqual(get_image_match_threshold(1), 0.34)
        self.assertEqual(get_image_match_threshold(2), 0.38)

    def test_match_embedding_accepts_clear_best_match(self):
        if not HAS_FACE_LIB:
            self.skipTest("face_recognition library not available")

        matched_user_id, distance = match_embedding(
            [0.10, 0.10],
            [
                (1, [0.12, 0.11]),
                (2, [0.45, 0.48]),
            ],
            tolerance=0.5,
        )

        self.assertEqual(matched_user_id, 1)
        self.assertIsNotNone(distance)

    def test_match_embedding_rejects_ambiguous_best_match(self):
        if not HAS_FACE_LIB:
            self.skipTest("face_recognition library not available")

        matched_user_id, distance = match_embedding(
            [0.0, 0.0],
            [
                (1, [0.44, 0.0]),
                (2, [0.45, 0.0]),
            ],
            tolerance=0.5,
        )

        self.assertIsNone(matched_user_id)
        self.assertIsNone(distance)


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
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
class PasswordResetEmailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()
        User = get_user_model()
        self.user = User.objects.create_user(
            username="resident_reset",
            password="ResidentReset!234",
            email="resident@example.com",
            is_resident=True,
        )
        ResidentProfile.objects.create(
            user=self.user,
            address="Sample Address",
            birthdate="2000-01-01",
            phone_number="09171234567",
        )
        self.admin = User.objects.create_user(
            username="admin_reset",
            password="AdminReset!234",
            email="admin@example.com",
            is_admin=True,
            is_staff=True,
        )

    def test_request_password_reset_sends_email(self):
        res = self.client.post(
            "/api/accounts/password/otp/request/",
            {"username": "resident_reset"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["resident@example.com"])
        self.assertIn("password reset code", mail.outbox[0].subject.lower())
        self.assertEqual(PasswordResetCode.objects.filter(user=self.user, used=False).count(), 1)

    def test_request_password_reset_requires_username(self):
        res = self.client.post(
            "/api/accounts/password/otp/request/",
            {},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(mail.outbox), 0)

    def test_password_reset_and_login_work_with_case_insensitive_username(self):
        request_res = self.client.post(
            "/api/accounts/password/otp/request/",
            {"username": "RESIDENT_RESET"},
            format="json",
        )
        self.assertEqual(request_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

        body = mail.outbox[0].body
        code_line = next(line for line in body.splitlines() if "password reset code is:" in line.lower())
        code = code_line.rsplit(":", 1)[-1].strip()

        verify_res = self.client.post(
            "/api/accounts/password/otp/verify/",
            {
                "username": "RESIDENT_RESET",
                "code": code,
                "new_password": "UpdatedReset!234",
            },
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)

        login_res = self.client.post(
            "/api/accounts/login/resident/",
            {"username": "RESIDENT_RESET", "password": "UpdatedReset!234"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", login_res.data.get("tokens", {}))

    def test_admin_password_reset_and_login_work(self):
        request_res = self.client.post(
            "/api/accounts/password/otp/request/",
            {"username": "ADMIN_RESET", "account_type": "admin"},
            format="json",
        )
        self.assertEqual(request_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["admin@example.com"])

        body = mail.outbox[0].body
        code_line = next(line for line in body.splitlines() if "password reset code is:" in line.lower())
        code = code_line.rsplit(":", 1)[-1].strip()

        verify_res = self.client.post(
            "/api/accounts/password/otp/verify/",
            {
                "username": "ADMIN_RESET",
                "account_type": "admin",
                "code": code,
                "new_password": "UpdatedAdmin!234",
            },
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)

        login_res = self.client.post(
            "/api/accounts/login/admin/",
            {"username": "ADMIN_RESET", "password": "UpdatedAdmin!234"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", login_res.data.get("tokens", {}))

    def test_gate_operator_password_reset_and_login_work(self):
        User = get_user_model()
        User.objects.create_user(
            username="gate_reset",
            password="GateReset!234",
            email="gate@example.com",
            is_gate_operator=True,
        )

        request_res = self.client.post(
            "/api/accounts/password/otp/request/",
            {"username": "GATE_RESET", "account_type": "gate"},
            format="json",
        )
        self.assertEqual(request_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["gate@example.com"])

        body = mail.outbox[0].body
        code_line = next(line for line in body.splitlines() if "password reset code is:" in line.lower())
        code = code_line.rsplit(":", 1)[-1].strip()

        verify_res = self.client.post(
            "/api/accounts/password/otp/verify/",
            {
                "username": "GATE_RESET",
                "account_type": "gate",
                "code": code,
                "new_password": "UpdatedGate!234",
            },
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)

        login_res = self.client.post(
            "/api/accounts/login/admin/",
            {"username": "GATE_RESET", "password": "UpdatedGate!234"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertEqual(login_res.data.get("meta", {}).get("role"), "GateOperator")


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
class AdminResidentPasswordResetFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_password_reset",
            password="AdminFlow!234",
            is_admin=True,
            is_staff=True,
        )
        self.resident = User.objects.create_user(
            username="resident_temp",
            password="ResidentFlow!234",
            email="resident_temp@example.com",
            is_resident=True,
        )
        ResidentProfile.objects.create(
            user=self.resident,
            address="Sample Address",
            birthdate="2000-01-01",
            phone_number="09171234001",
        )

    def test_admin_can_set_temporary_password_and_resident_must_change_it(self):
        self.client.force_authenticate(user=self.admin)
        reset_res = self.client.post(
            f"/api/residents/admin/{self.resident.id}/reset-password/",
            {"temporary_password": "Temporary!234"},
            format="json",
        )
        self.assertEqual(reset_res.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=None)
        login_res = self.client.post(
            "/api/accounts/login/resident/",
            {"username": "resident_temp", "password": "Temporary!234"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertTrue(login_res.data["user"]["must_change_password"])

        access = login_res.data["tokens"]["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        change_res = self.client.post(
            "/api/residents/change-password/",
            {"current_password": "Temporary!234", "new_password": "UpdatedResident!234"},
            format="json",
        )
        self.assertEqual(change_res.status_code, status.HTTP_200_OK)
        self.assertFalse(change_res.data["must_change_password"])

        self.client.credentials()
        second_login = self.client.post(
            "/api/accounts/login/resident/",
            {"username": "resident_temp", "password": "UpdatedResident!234"},
            format="json",
        )
        self.assertEqual(second_login.status_code, status.HTTP_200_OK)
        self.assertFalse(second_login.data["user"]["must_change_password"])
