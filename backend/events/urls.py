from django.urls import path
from . import views

urlpatterns = [
    # Core Event Endpoints
    path('', views.EventListView.as_view(), name='list_events'),
    path('create/', views.create_event, name='create_event'),
    path('<int:event_id>/', views.EventDetailView.as_view(), name='event_detail'),
    path('update/<int:event_id>/', views.update_event, name='update_event'),
    path('delete/<int:event_id>/', views.delete_event, name='delete_event'),

    # Resident Event Registration
    path('<int:event_id>/register/', views.register_for_event, name='register_for_event'),
    path('<int:event_id>/unregister/', views.unregister_for_event, name='unregister_for_event'),
    path('my-registrations/', views.my_registered_events, name='my_registered_events'),
    path('my-registrations/paginated/', views.MyRegistrationsListView.as_view(), name='my_registrations_paginated'),
    path('my-registrations/ids/', views.MyRegistrationIdsView.as_view(), name='my_registrations_ids'),
    # Prefer 'metrics' to avoid ad-blockers that block 'analytics'
    path('metrics/summary/', views.AttendanceAnalyticsView.as_view(), name='attendance_metrics'),
    path('metrics/event/<int:event_id>/summary/', views.EventAnalyticsByEventView.as_view(), name='event_metrics_summary'),
    path('metrics/event/<int:event_id>/attendees/', views.EventAttendeesByEventAnalyticsView.as_view(), name='event_metrics_attendees'),
    # Back-compat (may be blocked by client ad blockers):
    path('analytics/summary/', views.AttendanceAnalyticsView.as_view(), name='attendance_analytics'),
    path('analytics/event/<int:event_id>/summary/', views.EventAnalyticsByEventView.as_view(), name='event_analytics_summary'),
    path('analytics/event/<int:event_id>/attendees/', views.EventAttendeesByEventAnalyticsView.as_view(), name='event_analytics_attendees'),

    # Admin: View registrants & mark attendance
    path('<int:event_id>/registrants/', views.view_event_registrants, name='view_event_registrants'),
    path('attendance/mark/', views.mark_attendance, name='mark_attendance'),
    path('attendance/detect-face/', views.detect_face_presence, name='detect_face_presence'),
    path('attendance/mark-face/', views.mark_attendance_face, name='mark_attendance_face'),
    path('entry-logs/', views.EntryLogListView.as_view(), name='entry_log_list'),
    path('gate/events/', views.PublicGateEventListView.as_view(), name='gate_event_list'),
    path('gate/resident-log/mark/', views.gate_mark_resident_log, name='gate_mark_resident_log'),
    path('gate/resident-log/mark-face/', views.gate_mark_resident_log_face, name='gate_mark_resident_log_face'),
    path('gate/resident-log/logs/', views.ResidentGateLogListView.as_view(), name='gate_resident_log_list'),
    path('gate/attendance/mark/', views.gate_mark_attendance, name='gate_mark_attendance'),
    path('gate/attendance/detect-face/', views.gate_detect_face_presence, name='gate_detect_face_presence'),
    path('gate/attendance/mark-face/', views.gate_mark_attendance_face, name='gate_mark_attendance_face'),
    path('gate/entry-logs/', views.PublicGateEntryLogListView.as_view(), name='gate_entry_log_list'),

    # Class-based (APIView) Endpoints (aliases)
    path('attendance/all/', views.EventAttendanceListView.as_view(), name='attendance_list'),
    path('list/', views.EventListView.as_view(), name='event_list'),
    path('<int:event_id>/detail/', views.EventDetailView.as_view(), name='event_detail_view'),
    path('<int:id>/registrations/', views.EventRegistrationsView.as_view(), name='event_registrations'),
    path('<int:id>/attendance/', views.EventAttendanceByEventView.as_view(), name='event_attendance_by_event'),
    path('<int:id>/registrants/export/', views.export_event_registrants_csv, name='event_registrants_export'),
    path('<int:id>/attendance/export/', views.export_event_attendance_csv, name='event_attendance_export'),
]
