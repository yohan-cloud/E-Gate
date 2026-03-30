from django.contrib import admin
from .models import Event, EventRegistration, EventAttendance


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = (
        'title', 'event_type', 'date', 'status', 'venue', 'capacity',
        'registration_open', 'registration_close', 'created_by'
    )
    search_fields = ('title', 'event_type', 'venue', 'created_by__username')
    list_filter = ('event_type', 'status')


@admin.register(EventRegistration)
class EventRegistrationAdmin(admin.ModelAdmin):
    list_display = ('event', 'resident', 'registered_at', 'attendance_confirmed')
    search_fields = ('resident__username', 'event__title')
    list_filter = ('attendance_confirmed',)


@admin.register(EventAttendance)
class EventAttendanceAdmin(admin.ModelAdmin):
    list_display = ('registration', 'checked_in_at', 'verified_by')
    search_fields = ('registration__resident__username', 'registration__event__title', 'verified_by__username')
