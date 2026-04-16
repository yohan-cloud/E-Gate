from rest_framework import serializers

import json

from .models import AdminSetting, AuditLog, GuestAppointment, GuestAppointmentScanLog


class GuestAppointmentSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_name = serializers.CharField(source="updated_by.username", read_only=True)
    archived_by_name = serializers.CharField(source="archived_by.username", read_only=True)
    checked_in_by_name = serializers.CharField(source="checked_in_by.username", read_only=True)
    checked_out_by_name = serializers.CharField(source="checked_out_by.username", read_only=True)
    is_archived = serializers.SerializerMethodField()
    qr_payload = serializers.SerializerMethodField()
    qr_ready = serializers.SerializerMethodField()
    is_checked_in = serializers.SerializerMethodField()
    is_checked_out = serializers.SerializerMethodField()

    class Meta:
        model = GuestAppointment
        fields = [
            "id",
            "name",
            "organization_company",
            "no_of_participants",
            "contact",
            "purpose",
            "eta",
            "status",
            "notes",
            "qr_token",
            "qr_payload",
            "qr_ready",
            "checked_in_at",
            "checked_in_by",
            "checked_in_by_name",
            "checked_out_at",
            "checked_out_by",
            "checked_out_by_name",
            "is_checked_in",
            "is_checked_out",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "created_by_name",
            "updated_by_name",
            "archived_at",
            "archived_by",
            "archived_by_name",
            "archive_status",
            "archive_storage",
            "archive_key",
            "archive_checksum",
            "archive_error",
            "is_archived",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
            "qr_token",
            "qr_payload",
            "qr_ready",
            "checked_in_at",
            "checked_in_by",
            "checked_in_by_name",
            "checked_out_at",
            "checked_out_by",
            "checked_out_by_name",
            "is_checked_in",
            "is_checked_out",
            "created_by",
            "updated_by",
            "created_by_name",
            "updated_by_name",
            "archived_at",
            "archived_by",
            "archived_by_name",
            "archive_status",
            "archive_storage",
            "archive_key",
            "archive_checksum",
            "archive_error",
            "is_archived",
        ]

    def validate_name(self, value):
        value = (value or "").strip()
        if len(value) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return value

    def validate_purpose(self, value):
        value = (value or "").strip()
        if len(value) < 3:
            raise serializers.ValidationError("Purpose must be at least 3 characters.")
        return value

    def validate_contact(self, value):
        return (value or "").strip()

    def validate_organization_company(self, value):
        return (value or "").strip()

    def validate_no_of_participants(self, value):
        if value is None:
            return 1
        if value < 1:
            raise serializers.ValidationError("Number of participants must be at least 1.")
        return value

    def validate_notes(self, value):
        return (value or "").strip()

    def get_is_archived(self, obj):
        return bool(obj.archived_at)

    def get_qr_payload(self, obj):
        return json.dumps(
            {
                "type": "guest_appointment",
                "token": str(obj.qr_token),
                "appointment_id": obj.id,
                "guest_name": obj.name,
                "organization_company": obj.organization_company,
                "no_of_participants": obj.no_of_participants,
            },
            separators=(",", ":"),
        )

    def get_qr_ready(self, obj):
        return bool(obj.qr_token and not obj.archived_at and obj.status != GuestAppointment.Status.CANCELLED)

    def get_is_checked_in(self, obj):
        return bool(obj.checked_in_at)

    def get_is_checked_out(self, obj):
        return bool(obj.checked_out_at)


class GuestAppointmentScanLogSerializer(serializers.ModelSerializer):
    guest_name = serializers.CharField(source="appointment.name", read_only=True)
    organization_company = serializers.CharField(source="appointment.organization_company", read_only=True)
    no_of_participants = serializers.IntegerField(source="appointment.no_of_participants", read_only=True)
    guest_contact = serializers.CharField(source="appointment.contact", read_only=True)
    purpose = serializers.CharField(source="appointment.purpose", read_only=True)
    eta = serializers.DateTimeField(source="appointment.eta", read_only=True)
    recorded_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = GuestAppointmentScanLog
        fields = [
            "id",
            "appointment",
            "guest_name",
            "organization_company",
            "no_of_participants",
            "guest_contact",
            "purpose",
            "eta",
            "direction",
            "method",
            "reason",
            "recorded_by_name",
            "created_at",
        ]


class GuestAppointmentGateLookupSerializer(serializers.ModelSerializer):
    qr_ready = serializers.SerializerMethodField()
    is_checked_in = serializers.SerializerMethodField()
    is_checked_out = serializers.SerializerMethodField()

    class Meta:
        model = GuestAppointment
        fields = [
            "id",
            "name",
            "organization_company",
            "no_of_participants",
            "contact",
            "purpose",
            "eta",
            "status",
            "notes",
            "checked_in_at",
            "checked_out_at",
            "qr_ready",
            "is_checked_in",
            "is_checked_out",
        ]

    def get_qr_ready(self, obj):
        return bool(obj.qr_token and not obj.archived_at and obj.status != GuestAppointment.Status.CANCELLED)

    def get_is_checked_in(self, obj):
        return bool(obj.checked_in_at)

    def get_is_checked_out(self, obj):
        return bool(obj.checked_out_at)


class AdminSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdminSetting
        fields = ["key", "value", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_value(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Setting value must be an object.")
        return value


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True)
    actor_role = serializers.SerializerMethodField()
    resident_name = serializers.SerializerMethodField()
    resident_user_id = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "target_type",
            "target_id",
            "target_label",
            "actor",
            "actor_username",
            "actor_role",
            "resident_name",
            "resident_user_id",
            "ip_address",
            "user_agent",
            "metadata",
            "created_at",
        ]

    def get_actor_role(self, obj):
        actor = getattr(obj, "actor", None)
        if not actor:
            return ""
        if getattr(actor, "is_admin", False):
            return "Administrator"
        if getattr(actor, "is_gate_operator", False):
            return "GateOperator"
        if getattr(actor, "is_resident", False):
            return "Resident"
        return ""

    def get_resident_name(self, obj):
        metadata = getattr(obj, "metadata", {}) or {}
        return metadata.get("resident_name") or obj.target_label

    def get_resident_user_id(self, obj):
        metadata = getattr(obj, "metadata", {}) or {}
        value = metadata.get("resident_user_id")
        return str(value) if value is not None else ""
