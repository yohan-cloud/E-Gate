from rest_framework import serializers
from .models import Event, EventRegistration, EventAttendance, EntryLog, Venue
from django.utils import timezone
from django.conf import settings
try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except Exception:  # pragma: no cover
    ZoneInfo = None


EVENT_TYPE_VALUES = {value for value, _label in Event.EVENT_TYPES}
EVENT_TYPE_LABELS = dict(Event.EVENT_TYPES)
AUDIENCE_VALUES = {value for value, _label in Event.AUDIENCE_CHOICES}


def normalize_audience_type(value):
    if value is None:
        return "all"

    if isinstance(value, str):
        raw_items = [item.strip().lower() for item in value.split(",") if item.strip()]
    elif isinstance(value, (list, tuple, set)):
        raw_items = [str(item).strip().lower() for item in value if str(item).strip()]
    else:
        raise serializers.ValidationError("Invalid audience type.")

    if not raw_items:
        return "all"

    invalid = [item for item in raw_items if item not in AUDIENCE_VALUES]
    if invalid:
        raise serializers.ValidationError("Invalid audience type.")

    unique_items = []
    for item in raw_items:
        if item not in unique_items:
            unique_items.append(item)

    if "all" in unique_items:
        return "all"

    return ",".join(unique_items)


# 🧩 Event Serializer
class VenueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venue
        fields = [
            "id",
            "name",
            "max_capacity",
            "is_active",
            "created_at",
            "updated_at",
            "deactivated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "deactivated_at"]

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Venue name is required.")
        qs = Venue.objects.filter(name__iexact=name)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A venue with this name already exists.")
        return name

    def validate_max_capacity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Max capacity must be greater than 0.")
        return value


class EventSerializer(serializers.ModelSerializer):
    # Show username instead of raw user id
    created_by = serializers.StringRelatedField(read_only=True)
    registrations_count = serializers.SerializerMethodField()
    attendance_count = serializers.SerializerMethodField()
    is_archived = serializers.SerializerMethodField()
    venue_id = serializers.PrimaryKeyRelatedField(
        source="venue_ref",
        queryset=Venue.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    venue_ref_id = serializers.IntegerField(source="venue_ref.id", read_only=True, allow_null=True)
    venue_max_capacity = serializers.IntegerField(source="venue_ref.max_capacity", read_only=True, allow_null=True)

    class Meta:
        model = Event
        fields = [
            'id',
            'title',
            'description',
            'event_type',
            'audience_type',
            'date',
            'end_date',
            'venue_id',
            'venue_ref_id',
            'venue',
            'venue_max_capacity',
            'capacity',
            'registration_open',
            'registration_close',
            'status',
            'created_by',
            'created_at',
            'archived_at',
            'archive_status',
            'archive_storage',
            'archive_key',
            'is_archived',
            'registrations_count',
            'attendance_count',
        ]
        read_only_fields = ['created_by', 'created_at']

    def to_internal_value(self, data):
        attrs = super().to_internal_value(data)
        venue = attrs.get("venue_ref")
        if venue is not None:
            attrs["venue"] = venue.name
            if attrs.get("capacity") is None:
                attrs["capacity"] = venue.max_capacity
        return attrs

    def get_registrations_count(self, obj):
        annotated = getattr(obj, "registrations_count", None)
        if annotated is not None:
            return annotated
        try:
            return obj.registrations.count()
        except Exception:
            return 0

    def get_attendance_count(self, obj):
        annotated = getattr(obj, "attendance_count", None)
        if annotated is not None:
            return annotated
        try:
            return EventAttendance.objects.filter(registration__event=obj).count()
        except Exception:
            return 0

    def get_is_archived(self, obj):
        return bool(getattr(obj, "archived_at", None))

    def validate_event_type(self, value):
        """Make event_type case-insensitive and enforce known values."""
        normalized = (value or "").strip().lower()
        if normalized not in EVENT_TYPE_VALUES:
            raise serializers.ValidationError("Invalid event type.")
        return normalized

    def validate_audience_type(self, value):
        return normalize_audience_type(value)

    def validate(self, attrs):
        # Normalize naive datetimes to a configured local timezone to avoid unexpected shifts
        input_tz_name = getattr(settings, 'INPUT_LOCAL_TIMEZONE', None)
        input_tz = ZoneInfo(input_tz_name) if (input_tz_name and ZoneInfo) else timezone.get_current_timezone()

        date = attrs.get('date', getattr(self.instance, 'date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        reg_open = attrs.get('registration_open', getattr(self.instance, 'registration_open', None))
        reg_close = attrs.get('registration_close', getattr(self.instance, 'registration_close', None))
        capacity = attrs.get('capacity', getattr(self.instance, 'capacity', None))
        venue_ref = attrs.get('venue_ref', getattr(self.instance, 'venue_ref', None))

        def _localize(dt):
            if dt and timezone.is_naive(dt):
                try:
                    return timezone.make_aware(dt, input_tz)
                except Exception:
                    return timezone.make_aware(dt)
            return dt

        if date:
            nd = _localize(date)
            if nd is not date:
                attrs['date'] = nd
                date = nd
        if end_date:
            ne = _localize(end_date)
            if ne is not end_date:
                attrs['end_date'] = ne
                end_date = ne
        if reg_open:
            no = _localize(reg_open)
            if no is not reg_open:
                attrs['registration_open'] = no
                reg_open = no
        if reg_close:
            nc = _localize(reg_close)
            if nc is not reg_close:
                attrs['registration_close'] = nc
                reg_close = nc

        if capacity is not None and capacity < 0:
            raise serializers.ValidationError({ 'capacity': 'Capacity must be >= 0.' })
        if "venue_ref" in attrs and venue_ref is not None and not venue_ref.is_active:
            raise serializers.ValidationError({ 'venue_id': 'Select an active venue.' })
        if date and end_date and end_date <= date:
            raise serializers.ValidationError({ 'end_date': 'End date/time must be after the event start.' })
        if reg_open and reg_close and reg_open > reg_close:
            raise serializers.ValidationError({ 'registration_open': 'Open must be before close.' })
        if date and reg_close and reg_close > date:
            raise serializers.ValidationError({ 'registration_close': 'Close cannot be after event date.' })
        if date and date < timezone.now():
            raise serializers.ValidationError({ 'date': 'Event date must be in the future.' })
        return attrs

# 🧩 Event Registration Serializer
class EventRegistrationSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source='event.title', read_only=True)
    event_description = serializers.CharField(source='event.description', read_only=True)
    event_date = serializers.DateTimeField(source='event.date', read_only=True)
    event_venue = serializers.CharField(source='event.venue', read_only=True)
    event_status = serializers.CharField(source='event.status', read_only=True)
    event_capacity = serializers.IntegerField(source='event.capacity', read_only=True, allow_null=True)
    event_registrations_count = serializers.SerializerMethodField(read_only=True)
    resident_username = serializers.CharField(source='resident.username', read_only=True)
    # Reflect true attendance status based on existence of related record
    attendance_confirmed = serializers.SerializerMethodField(read_only=True)
    resident_has_face = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = EventRegistration
        fields = [
            'id',
            'event',
            'event_title',
            'event_description',
            'event_date',
            'event_venue',
            'event_status',
            'event_capacity',
            'event_registrations_count',
            'resident',
            'resident_username',
            'registered_at',
            'attendance_confirmed',
            'resident_has_face'
        ]
        # event/resident are set server-side in views; keep them read-only
        read_only_fields = ['registered_at', 'attendance_confirmed', 'event', 'resident']

    def get_attendance_confirmed(self, obj):
        try:
            return bool(obj.attendance)
        except Exception:
            return False

    def get_event_registrations_count(self, obj):
        try:
            event = getattr(obj, "event", None)
            if event is None:
                return 0
            annotated = getattr(event, "registrations_count", None)
            if annotated is not None:
                return annotated
            return event.registrations.count()
        except Exception:
            return 0

    def get_resident_has_face(self, obj):
        try:
            prof = getattr(obj.resident, 'profile', None)
            return bool(
                getattr(prof, 'face_embedding', None) or getattr(prof, 'face_image', None)
            )
        except Exception:
            return False


# 🧩 Event Attendance Serializer
class EventAttendanceSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source='registration.event.title', read_only=True)
    event_id = serializers.IntegerField(source='registration.event.id', read_only=True)
    event_capacity = serializers.IntegerField(source='registration.event.capacity', read_only=True, allow_null=True)
    event_registrations_count = serializers.SerializerMethodField(read_only=True)
    resident_username = serializers.CharField(source='registration.resident.username', read_only=True)
    verified_by = serializers.SerializerMethodField(read_only=True)
    barangay_id = serializers.SerializerMethodField(read_only=True)
    resident_address = serializers.SerializerMethodField(read_only=True)
    resident_zone = serializers.SerializerMethodField(read_only=True)
    resident_verified = serializers.SerializerMethodField(read_only=True)
    resident_expiry_date = serializers.SerializerMethodField(read_only=True)
    resident_photo = serializers.SerializerMethodField(read_only=True)
    resident_face_image = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = EventAttendance
        fields = [
            'id',
            'event_id',
            'event_title',
            'event_capacity',
            'event_registrations_count',
            'resident_username',
            'checked_in_at',
            'verified_by',
            'barangay_id',
            'resident_address',
            'resident_zone',
            'resident_verified',
            'resident_expiry_date',
            'resident_photo',
            'resident_face_image',
        ]
        read_only_fields = ['checked_in_at', 'verified_by']

    def _build_url(self, path: str):
        if not path:
            return None
        request = self.context.get('request') if isinstance(self.context, dict) else None
        if request:
            return request.build_absolute_uri(path)
        return path

    def get_verified_by(self, obj):
        if obj.verified_by:
            return str(obj.verified_by)
        try:
            has_gate_log = EntryLog.objects.filter(
                user=obj.registration.resident,
                event=obj.registration.event,
                direction="time_in",
                status="allowed",
            ).exists()
        except Exception:
            has_gate_log = False
        return "Gate Operator" if has_gate_log else None

    def get_barangay_id(self, obj):
        try:
            return str(obj.registration.resident.profile.barangay_id)
        except Exception:
            return None

    def get_event_registrations_count(self, obj):
        try:
            event = obj.registration.event
            annotated = getattr(event, "registrations_count", None)
            if annotated is not None:
                return annotated
            return event.registrations.count()
        except Exception:
            return 0

    def get_resident_address(self, obj):
        try:
            return obj.registration.resident.profile.address
        except Exception:
            return None

    def get_resident_zone(self, obj):
        try:
            address = obj.registration.resident.profile.address or ""
            parts = [part.strip() for part in address.split(",") if part.strip()]
            return parts[-1] if parts else address or None
        except Exception:
            return None

    def get_resident_verified(self, obj):
        try:
            return bool(obj.registration.resident.profile.is_verified)
        except Exception:
            return False

    def get_resident_expiry_date(self, obj):
        try:
            expiry = obj.registration.resident.profile.expiry_date
            return expiry.isoformat() if expiry else None
        except Exception:
            return None

    def get_resident_photo(self, obj):
        try:
            photo = obj.registration.resident.profile.photo
            return self._build_url(photo.url) if photo else None
        except Exception:
            return None

    def get_resident_face_image(self, obj):
        try:
            face = obj.registration.resident.profile.face_image
            return self._build_url(face.url) if face else None
        except Exception:
            return None


class EntryLogSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source="event.title", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    recorded_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = EntryLog
        fields = [
            "id",
            "event",
            "event_title",
            "username",
            "direction",
            "method",
            "status",
            "confidence",
            "created_at",
            "recorded_by",
        ]


class ResidentGateLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    barangay_id = serializers.SerializerMethodField(read_only=True)
    resident_address = serializers.SerializerMethodField(read_only=True)
    resident_zone = serializers.SerializerMethodField(read_only=True)
    resident_verified = serializers.SerializerMethodField(read_only=True)
    resident_expiry_date = serializers.SerializerMethodField(read_only=True)
    recorded_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = EntryLog
        fields = [
            "id",
            "username",
            "barangay_id",
            "direction",
            "method",
            "status",
            "confidence",
            "created_at",
            "recorded_by",
            "resident_address",
            "resident_zone",
            "resident_verified",
            "resident_expiry_date",
        ]

    def get_barangay_id(self, obj):
        try:
            return str(obj.user.profile.barangay_id)
        except Exception:
            return None

    def get_resident_address(self, obj):
        try:
            return obj.user.profile.address
        except Exception:
            return None

    def get_resident_zone(self, obj):
        try:
            address = obj.user.profile.address or ""
            parts = [part.strip() for part in address.split(",") if part.strip()]
            return parts[-1] if parts else address or None
        except Exception:
            return None

    def get_resident_verified(self, obj):
        try:
            return bool(obj.user.profile.is_verified)
        except Exception:
            return False

    def get_resident_expiry_date(self, obj):
        try:
            expiry = obj.user.profile.expiry_date
            return expiry.isoformat() if expiry else None
        except Exception:
            return None

