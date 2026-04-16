try:
    from celery import shared_task
except Exception:  # Celery not installed; provide no-op decorator
    def shared_task(func=None, **_kwargs):
        def wrapper(f):
            return f
        return wrapper(func) if func else wrapper

from django.http import StreamingHttpResponse
from django.utils import timezone
from .models import Event, EventRegistration, EventAttendance
import csv


@shared_task
def generate_event_registrants_csv(event_id: int) -> str:
    event = Event.objects.get(id=event_id)
    # In a real setup, write to storage (S3) and return URL. Here we return a CSV string.
    rows = EventRegistration.objects.select_related('resident').filter(event=event).order_by('registered_at')
    output = ["Event ID,Event Title,Resident Username,Registered At,Attendance Confirmed\n"]
    for r in rows:
        output.append(
            f"{event.id},{event.title},{getattr(r.resident,'username','')},{r.registered_at},{r.attendance_confirmed}\n"
        )
    return "".join(output)


@shared_task
def generate_event_attendance_csv(event_id: int) -> str:
    event = Event.objects.get(id=event_id)
    rows = EventAttendance.objects.select_related('registration', 'registration__resident', 'verified_by').filter(
        registration__event=event
    ).order_by('-checked_in_at')
    output = ["Event ID,Event Title,Resident Username,Checked In At,Verified By\n"]
    for a in rows:
        output.append(
            f"{event.id},{event.title},{getattr(a.registration.resident,'username','')},{a.checked_in_at},{getattr(a.verified_by,'username','')}\n"
        )
    return "".join(output)

