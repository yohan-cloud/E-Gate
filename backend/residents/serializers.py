from rest_framework import serializers
from .models import ResidentProfile, User, VerificationRequest
import re
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone

class UserSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'is_resident', 'is_admin', 'first_name', 'last_name', 'must_change_password']

    def _should_reveal_sensitive(self):
        return bool(self.context.get("reveal_sensitive"))

    def _mask_email(self, value):
        if not value:
            return value
        if "@" not in value:
            return value[:2] + "****" if len(value) > 2 else "****"
        local, domain = value.split("@", 1)
        if len(local) <= 2:
            masked_local = local[:1] + "*" * max(len(local) - 1, 1)
        else:
            masked_local = local[:2] + "*" * max(len(local) - 2, 3)
        return f"{masked_local}@{domain}"

    def get_email(self, obj):
        email = getattr(obj, "email", "")
        if self._should_reveal_sensitive():
            return email
        return self._mask_email(email)


class ResidentProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    photo_thumb = serializers.SerializerMethodField(read_only=True)
    has_face = serializers.SerializerMethodField(read_only=True)
    phone_number = serializers.CharField(read_only=True)
    gender = serializers.CharField(read_only=True)
    resident_category = serializers.CharField(read_only=True)
    voter_status = serializers.CharField(read_only=True)
    is_verified = serializers.BooleanField(read_only=True)
    verified_at = serializers.DateTimeField(read_only=True)
    sensitive_revealed = serializers.SerializerMethodField(read_only=True)
    is_archived = serializers.SerializerMethodField(read_only=True)
    archived_at = serializers.DateTimeField(read_only=True)
    archive_status = serializers.CharField(read_only=True)
    archive_storage = serializers.CharField(read_only=True)
    archive_key = serializers.CharField(read_only=True)
    is_deactivated = serializers.SerializerMethodField(read_only=True)
    deactivated_at = serializers.DateTimeField(read_only=True)
    deactivation_reason = serializers.CharField(read_only=True)
    deactivated_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ResidentProfile
        # Expose photo + derived thumbnail URL
        fields = [
            'user',
            'barangay_id',
            'address',
            'birthdate',
            'date_registered',
            'expiry_date',
            'phone_number',
            'gender',
            'resident_category',
            'voter_status',
            'photo',
            'photo_thumb',
            'has_face',
            'is_verified',
            'verified_at',
            'sensitive_revealed',
            'is_archived',
            'archived_at',
            'archive_status',
            'archive_storage',
            'archive_key',
            'is_deactivated',
            'deactivated_at',
            'deactivation_reason',
            'deactivated_by_name',
        ]

    def _should_reveal_sensitive(self):
        return bool(self.context.get("reveal_sensitive"))

    def _mask_phone(self, value):
        if not value:
            return value
        digits = re.sub(r"\D", "", value)
        if len(digits) <= 4:
            return "*" * len(digits)
        return f"{digits[:4]}{'*' * max(len(digits) - 6, 3)}{digits[-2:]}"

    def _mask_address(self, value):
        if not value:
            return value
        parts = [part.strip() for part in str(value).split(",") if part.strip()]
        if len(parts) >= 2:
            return f"****, {parts[-1]}"
        trimmed = str(value).strip()
        if len(trimmed) <= 6:
            return "*" * len(trimmed)
        return f"{trimmed[:2]}{'*' * max(len(trimmed) - 4, 4)}{trimmed[-2:]}"

    def get_photo_thumb(self, obj):
        try:
            if not obj.photo:
                return None
            import os
            from django.conf import settings
            from django.core.files.storage import default_storage
            base = os.path.basename(obj.photo.name)
            rel = f"photos/thumbs/{base}"
            if default_storage.exists(rel):
                url = settings.MEDIA_URL + rel
                request = self.context.get('request')
                return request.build_absolute_uri(url) if request else url
            return None
        except Exception:
            return None

    def get_has_face(self, obj):
        try:
            return bool(obj.face_embedding or obj.face_image)
        except Exception:
            return False

    def get_sensitive_revealed(self, obj):
        return self._should_reveal_sensitive()

    def get_is_archived(self, obj):
        return bool(obj.archived_at)

    def get_is_deactivated(self, obj):
        return bool(obj.deactivated_at)

    def get_deactivated_by_name(self, obj):
        user = getattr(obj, "deactivated_by", None)
        if not user:
            return ""
        full_name = f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
        return full_name or getattr(user, "username", "") or ""

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self._should_reveal_sensitive():
            data["phone_number"] = self._mask_phone(data.get("phone_number"))
            data["address"] = self._mask_address(data.get("address"))
        return data

class ResidentIDSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = ResidentProfile
        fields = ['username', 'barangay_id', 'date_registered', 'expiry_date']


class AdminResidentUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    birthdate = serializers.DateField(required=False)
    expiry_date = serializers.DateField(required=False)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    phone_number = serializers.CharField(required=False, allow_blank=True)
    gender = serializers.ChoiceField(
        required=False,
        allow_blank=True,
        choices=[
            ("male", "Male"),
            ("female", "Female"),
            ("other", "Other"),
            ("unspecified", "Unspecified"),
        ],
    )
    resident_category = serializers.ChoiceField(
        required=False,
        allow_blank=True,
        choices=ResidentProfile.ResidentCategory.choices,
    )
    voter_status = serializers.ChoiceField(
        required=False,
        allow_blank=True,
        choices=ResidentProfile.VoterStatus.choices,
    )

    def validate_address(self, value):
        if value and len(value.strip()) < 5:
            raise serializers.ValidationError("Address must be at least 5 characters.")
        return value.strip() if value else value

    def validate(self, attrs):
        pwd = attrs.get("password")
        user = self.context.get("user")
        if pwd:
            try:
                validate_password(pwd, user=user)
            except Exception as e:
                raise serializers.ValidationError({"password": list(e.messages)})
        phone = attrs.get("phone_number")
        if phone:
            digits = re.sub(r"\D", "", phone)
            if len(digits) < 10 or len(digits) > 15:
                raise serializers.ValidationError({"phone_number": "Phone number must be 10-15 digits."})
            # ensure unique phone
            qs = ResidentProfile.objects.filter(phone_number=digits)
            if user:
                qs = qs.exclude(user=user)
            if qs.exists():
                raise serializers.ValidationError({"phone_number": "Phone number already in use."})
            attrs["phone_number"] = digits
        return attrs

    def update(self, instance, validated_data):
        # instance is a ResidentProfile
        user = getattr(instance, "user", None)
        if not user:
            return instance
        user.username = validated_data.get("username", user.username)
        user.email = validated_data.get("email", user.email)
        user.first_name = validated_data.get("first_name", user.first_name)
        user.last_name = validated_data.get("last_name", user.last_name)
        pwd = validated_data.get("password")
        if pwd:
            user.set_password(pwd)
        user.is_resident = True
        user.save()

        instance.address = validated_data.get("address", instance.address)
        instance.birthdate = validated_data.get("birthdate", instance.birthdate)
        instance.expiry_date = validated_data.get("expiry_date", instance.expiry_date)
        if validated_data.get("phone_number"):
            instance.phone_number = validated_data["phone_number"]
        if "gender" in validated_data:
            g = validated_data.get("gender") or ResidentProfile.Gender.UNSPECIFIED
            instance.gender = g if g in dict(ResidentProfile.Gender.choices) else ResidentProfile.Gender.UNSPECIFIED
        if "resident_category" in validated_data:
            category = validated_data.get("resident_category") or ResidentProfile.ResidentCategory.RESIDENT
            instance.resident_category = (
                category
                if category in dict(ResidentProfile.ResidentCategory.choices)
                else ResidentProfile.ResidentCategory.RESIDENT
            )
        if "voter_status" in validated_data:
            voter_status = validated_data.get("voter_status") or ResidentProfile.VoterStatus.UNSPECIFIED
            instance.voter_status = (
                voter_status
                if voter_status in dict(ResidentProfile.VoterStatus.choices)
                else ResidentProfile.VoterStatus.UNSPECIFIED
            )
        instance.save()
        return instance


class VerificationRequestSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    reviewed_by = UserSerializer(read_only=True)
    document_url = serializers.SerializerMethodField()
    phone_number = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    expiry_date = serializers.SerializerMethodField()
    is_verified = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    request_kind = serializers.SerializerMethodField()

    class Meta:
        model = VerificationRequest
        fields = [
            "id",
            "user",
            "full_name",
            "phone_number",
            "status",
            "note",
            "admin_note",
            "document",
            "document_url",
            "expiry_date",
            "is_verified",
            "is_expired",
            "request_kind",
            "created_at",
            "reviewed_at",
            "reviewed_by",
        ]
        read_only_fields = ["status", "admin_note", "created_at", "reviewed_at", "reviewed_by", "user", "document_url"]

    def get_document_url(self, obj):
        try:
            if not obj.document:
                return None
            request = self.context.get("request")
            url = obj.document.url
            return request.build_absolute_uri(url) if request else url
        except Exception:
            return None

    def get_phone_number(self, obj):
        try:
            prof = getattr(obj.user, "profile", None)
            return prof.phone_number if prof else None
        except Exception:
            return None

    def get_full_name(self, obj):
        try:
            fn = (obj.user.first_name or "").strip()
            ln = (obj.user.last_name or "").strip()
            name = f"{fn} {ln}".strip()
            return name or obj.user.username
        except Exception:
            return None

    def get_expiry_date(self, obj):
        try:
            prof = getattr(obj.user, "profile", None)
            return prof.expiry_date.isoformat() if prof and prof.expiry_date else None
        except Exception:
            return None

    def get_is_verified(self, obj):
        try:
            prof = getattr(obj.user, "profile", None)
            return bool(prof.is_verified) if prof else False
        except Exception:
            return False

    def get_is_expired(self, obj):
        try:
            prof = getattr(obj.user, "profile", None)
            return bool(prof and prof.expiry_date and prof.expiry_date < timezone.localdate())
        except Exception:
            return False

    def get_request_kind(self, obj):
        return "reverification" if self.get_is_expired(obj) else "verification"
