from django.urls import path

from . import views


urlpatterns = [
    path("audit-logs/", views.AuditLogListView.as_view(), name="audit_logs"),
    path("guests/", views.GuestAppointmentListCreateView.as_view(), name="guest_appointments"),
    path("guests/today/", views.guests_today, name="guest_appointments_today"),
    path("guests/gate/lookup/", views.gate_lookup_guest_appointments, name="guest_appointments_gate_lookup"),
    path("guests/gate/scan/", views.gate_scan_guest_appointment, name="guest_appointment_gate_scan"),
    path("guests/gate/manual-scan/", views.gate_manual_guest_scan, name="guest_appointment_gate_manual_scan"),
    path("guests/gate/logs/", views.GuestAppointmentGateLogListView.as_view(), name="guest_appointment_gate_logs"),
    path("guests/<int:pk>/archive/", views.archive_guest, name="guest_appointment_archive"),
    path("guests/<int:pk>/manual-scan/", views.admin_manual_guest_scan, name="guest_appointment_manual_scan"),
    path("guests/<int:pk>/unarchive/", views.unarchive_guest, name="guest_appointment_unarchive"),
    path("guests/<int:pk>/", views.GuestAppointmentDetailView.as_view(), name="guest_appointment_detail"),
    path("settings/admin-ui/", views.admin_ui_settings, name="admin_ui_settings"),
]
