"""
accounts/serializers.py
-----------------------
This module defines serializers for user registration and authentication
with a clear separation between Resident and Admin logic.

Maintainer: E-Gate Backend Team (Adamson University)
"""

from datetime import date, timedelta
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
import re
from residents.models import ResidentProfile, VerificationRequest
from accounts.face_utils import extract_embedding, average_embeddings, validate_face_image, FaceLibNotAvailable
from django.core.validators import RegexValidator
from accounts.models import GateAuditLog

User = get_user_model()


# 👤 Resident Registration Serializer
class ResidentRegisterSerializer(serializers.ModelSerializer):
    """
    Handles resident account creation together with ResidentProfile.
    """
    # Accept a human-friendly full name; username becomes optional and auto-generated if omitted
    full_name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=True)
    address = serializers.CharField(required=True)
    birthdate = serializers.DateField(required=True)
    phone_number = serializers.CharField(required=True)
    gender = serializers.ChoiceField(
        choices=[
            ("male", "Male"),
            ("female", "Female"),
            ("other", "Other"),
            ("unspecified", "Unspecified"),
        ],
        required=False,
        allow_blank=True,
    )
    resident_category = serializers.ChoiceField(
        choices=ResidentProfile.ResidentCategory.choices,
        required=False,
        allow_blank=True,
    )
    voter_status = serializers.ChoiceField(
        choices=ResidentProfile.VoterStatus.choices,
        required=False,
        allow_blank=True,
    )
    photo = serializers.ImageField(required=False, allow_null=True, write_only=True)
    id_document = serializers.FileField(required=False, allow_null=True, write_only=True)
    # Optional: face image at registration time (multipart)
    face_image = serializers.ImageField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = User
        fields = [
            "username",
            "full_name",
            "password",
            "email",
            "address",
            "birthdate",
            "phone_number",
            "gender",
            "resident_category",
            "voter_status",
            "photo",
            "id_document",
            "face_image",
        ]
        extra_kwargs = {
            "password": {"write_only": True},
            "username": {"required": False, "allow_blank": True},
        }

    def validate_birthdate(self, value):
        if value > date.today():
            raise serializers.ValidationError("Birthdate cannot be in the future.")
        return value

    def validate_address(self, value):
        if not value or len(value.strip()) < 5:
            raise serializers.ValidationError("Address must be at least 5 characters long.")
        return value.strip()

    def validate_phone_number(self, value):
        digits = re.sub(r"\D", "", value or "")
        if len(digits) < 10 or len(digits) > 15:
            raise serializers.ValidationError("Phone number must be 10-15 digits.")
        return digits

    def validate_email(self, value):
        normalized = (value or "").strip().lower()
        if not normalized:
            raise serializers.ValidationError("Email is required.")
        return normalized

    def validate_id_document(self, value):
        if not value:
            return value
        allowed_types = {'image/jpeg', 'image/png', 'image/webp', 'application/pdf'}
        content_type = getattr(value, 'content_type', None)
        if content_type not in allowed_types:
            raise serializers.ValidationError("Unsupported file type. Use JPG, PNG, WEBP, or PDF.")
        if getattr(value, 'size', None) and value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("File too large. Max 5MB.")
        return value

    def validate(self, attrs):
        # Run Django's password validators for consistency with AUTH_PASSWORD_VALIDATORS
        pwd = attrs.get("password")
        username = attrs.get("username")
        full_name = (attrs.get("full_name") or "").strip()
        email = attrs.get("email")
        phone = attrs.get("phone_number")
        # Generate a temporary username if needed for password validation context
        # derive a camel-cased base from full name for validation context
        def _name_to_camel(s: str) -> str:
            parts = re.findall(r"[A-Za-z0-9]+", s)
            return "".join(p.capitalize() for p in parts) or "user"
        temp_username = username or _name_to_camel(full_name)
        temp_user = User(username=temp_username, email=email)
        try:
            validate_password(pwd, user=temp_user)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)})
        # Ensure we have a username or a full name to derive one
        if not username and not full_name:
            raise serializers.ValidationError({"full_name": "Full name is required when username is omitted."})
        if phone:
            digits = re.sub(r"\D", "", phone)
            if ResidentProfile.objects.filter(phone_number=digits).exists():
                raise serializers.ValidationError({"phone_number": "Phone number already in use."})
        return attrs

    def create(self, validated_data):
        # Extract related ResidentProfile data
        address = validated_data.pop("address").strip()
        birthdate = validated_data.pop("birthdate")
        phone_number = validated_data.pop("phone_number")
        gender = (validated_data.pop("gender", "") or "unspecified").strip().lower() or "unspecified"
        resident_category = (
            (validated_data.pop("resident_category", "") or ResidentProfile.ResidentCategory.RESIDENT)
            .strip()
            .lower()
        )
        voter_status = (
            (validated_data.pop("voter_status", "") or ResidentProfile.VoterStatus.UNSPECIFIED)
            .strip()
            .lower()
        )
        full_name = validated_data.pop("full_name", "").strip()
        request = self.context.get('request')
        photo_file = request.FILES.get('photo') if request else None
        id_document = request.FILES.get('id_document') if request else None
        face_files = request.FILES.getlist('face_images') if request else []
        if not face_files and request:
            single_face_file = request.FILES.get('face_image')
            if single_face_file:
                face_files = [single_face_file]
        # Compute username if omitted: CamelCase from full_name (no dashes), then dedupe with numeric suffix
        username = (validated_data.get("username") or "").strip()
        if not username:
            parts = re.findall(r"[A-Za-z0-9]+", full_name)
            base = "".join(p.capitalize() for p in parts) or "User"
            # keep it compact but readable; final username max 150 by Django default
            base = base[:50]
            candidate = base
            i = 0
            while User.objects.filter(username=candidate).exists():
                i += 1
                candidate = f"{base}{i}"
                if len(candidate) > 150:
                    candidate = candidate[:150]
            username = candidate

        # Split full_name into first_name/last_name (best effort)
        first_name = last_name = ""
        if full_name:
            parts = full_name.split()
            if len(parts) == 1:
                first_name = parts[0]
            else:
                first_name = " ".join(parts[:-1])
                last_name = parts[-1]

        with transaction.atomic():
            # Create resident user
            user = User.objects.create_user(
                username=username,
                password=validated_data["password"],
                email=validated_data.get("email", ""),
                is_resident=True,
                first_name=first_name,
                last_name=last_name,
            )

            # Auto-generate resident profile with 1-year validity
            profile = ResidentProfile.objects.create(
                user=user,
                address=address,
                birthdate=birthdate,
                phone_number=phone_number,
                gender=gender if gender in dict(ResidentProfile.Gender.choices) else ResidentProfile.Gender.UNSPECIFIED,
                resident_category=(
                    resident_category
                    if resident_category in dict(ResidentProfile.ResidentCategory.choices)
                    else ResidentProfile.ResidentCategory.RESIDENT
                ),
                voter_status=(
                    voter_status
                    if voter_status in dict(ResidentProfile.VoterStatus.choices)
                    else ResidentProfile.VoterStatus.UNSPECIFIED
                ),
                date_registered=date.today(),
                expiry_date=date.today() + timedelta(days=365),
                is_verified=True,
                verified_at=timezone.now(),
            )

            if photo_file:
                profile.photo = photo_file
                profile.save(update_fields=['photo'])

            if id_document:
                VerificationRequest.objects.create(
                    user=user,
                    document=id_document,
                    note="ID document collected during admin resident registration.",
                    admin_note="Resident auto-verified during admin registration.",
                    status=VerificationRequest.Status.APPROVED,
                    reviewed_by=getattr(request, "user", None) if request else None,
                    reviewed_at=timezone.now(),
                )

            # If a face image was provided and face library is available, enroll embedding
            if face_files:
                try:
                    embeddings = []
                    first_face_file = face_files[0]
                    for face_file in face_files:
                        embeddings.append(extract_embedding(face_file))
                    embedding = embeddings[0] if len(embeddings) == 1 else average_embeddings(embeddings)
                    try:
                        first_face_file.seek(0)
                    except Exception:
                        pass
                    profile.face_image = first_face_file
                    profile.face_embedding = embedding
                    profile.save(update_fields=['face_image', 'face_embedding', 'face_updated_at'])
                except FaceLibNotAvailable:
                    try:
                        first_face_file = face_files[0]
                        validate_face_image(first_face_file)
                        try:
                            first_face_file.seek(0)
                        except Exception:
                            pass
                        profile.face_image = first_face_file
                        profile.face_embedding = None
                        profile.save(update_fields=['face_image', 'face_embedding', 'face_updated_at'])
                    except Exception:
                        pass
                except Exception:
                    # Do not fail account creation due to face processing errors
                    pass

        return user


# 🧑‍💼 Admin Registration Serializer
class AdminRegisterSerializer(serializers.ModelSerializer):
    """
    Handles admin account creation with elevated permissions.
    """

    class Meta:
        model = User
        fields = ["username", "password", "email"]
        extra_kwargs = {
            "password": {"write_only": True},
            "email": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        pwd = attrs.get("password")
        username = attrs.get("username")
        email = attrs.get("email")
        temp_user = User(username=username, email=email, is_staff=True, is_superuser=False)
        try:
            validate_password(pwd, user=temp_user)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)})
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            return User.objects.create_user(
                username=validated_data["username"],
                password=validated_data["password"],
                email=validated_data.get("email", ""),
                is_admin=True,
                is_staff=True,
                is_superuser=False,  # keep limited to E-Gate, not Django admin site
            )


# 🔐 Login Serializer (shared by both Resident and Admin)
class GateOperatorRegisterSerializer(serializers.ModelSerializer):
    """
    Handles gate operator account creation with gate-only permissions.
    """

    full_name = serializers.CharField(required=True, allow_blank=False)
    contact_number = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = User
        fields = ["full_name", "username", "email", "contact_number", "password", "is_active"]
        extra_kwargs = {
            "password": {"write_only": True},
            "email": {"required": False, "allow_blank": True},
        }

    def validate_full_name(self, value):
        cleaned = " ".join((value or "").strip().split())
        if len(cleaned) < 3:
            raise serializers.ValidationError("Full name must be at least 3 characters long.")
        return cleaned

    def validate_email(self, value):
        return (value or "").strip().lower()

    def validate_contact_number(self, value):
        digits = re.sub(r"\D", "", value or "")
        if digits and (len(digits) < 7 or len(digits) > 15):
            raise serializers.ValidationError("Contact number must be 7-15 digits.")
        return digits

    def validate(self, attrs):
        pwd = attrs.get("password")
        username = attrs.get("username")
        email = attrs.get("email")
        full_name = attrs.get("full_name")
        contact_number = attrs.get("contact_number", "")
        temp_user = User(
            username=username,
            email=email,
            first_name=full_name,
            contact_number=contact_number,
            is_gate_operator=True,
        )
        try:
            validate_password(pwd, user=temp_user)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)})
        return attrs

    def create(self, validated_data):
        full_name = validated_data.pop("full_name", "").strip()
        contact_number = validated_data.pop("contact_number", "")
        is_active = validated_data.pop("is_active", True)
        first_name = full_name
        last_name = ""
        if full_name:
            parts = full_name.split()
            if len(parts) > 1:
                first_name = " ".join(parts[:-1])
                last_name = parts[-1]
        with transaction.atomic():
            return User.objects.create_user(
                username=validated_data["username"],
                password=validated_data["password"],
                email=validated_data.get("email", ""),
                first_name=first_name,
                last_name=last_name,
                contact_number=contact_number,
                is_gate_operator=True,
                is_staff=False,
                is_superuser=False,
                is_active=is_active,
            )


class LoginSerializer(serializers.Serializer):
    """
    Basic login input validation for username/password.
    """
    username = serializers.CharField(required=True)
    password = serializers.CharField(write_only=True, required=True)


class GateAuditLogSerializer(serializers.ModelSerializer):
    action_label = serializers.CharField(source="get_action_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    performed_by_username = serializers.CharField(source="performed_by.username", read_only=True, default="")

    class Meta:
        model = GateAuditLog
        fields = [
            "id",
            "created_at",
            "gate_user",
            "gate_username",
            "gate_full_name",
            "action_type",
            "action_label",
            "status",
            "status_label",
            "performed_by",
            "performed_by_username",
            "performed_by_label",
            "details",
            "ip_address",
            "metadata",
        ]
        read_only_fields = fields
