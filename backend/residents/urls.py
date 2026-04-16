from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register_resident, name='register_resident'),
    path('login/', views.login_resident, name='login_resident'),
    path('profile/', views.resident_profile, name='resident_profile'),
    path('change-password/', views.resident_change_password, name='resident_change_password'),
    path('profile/photo/', views.update_profile_photo, name='resident_profile_photo'),
    path('virtual-id/', views.resident_virtual_id, name='resident_virtual_id'),
    path('verification/', views.resident_verification_request, name='resident_verification_request'),
    path('face/enroll/', views.enroll_face, name='resident_face_enroll'),
    path('renew/', views.renew_resident_id, name='resident_id_renew'),
    path('list/', views.ResidentListView.as_view(), name='resident_list_admin'),
    path('admin/<int:user_id>/', views.admin_update_resident, name='resident_admin_update'),
    path('admin/<int:user_id>/reset-password/', views.admin_reset_resident_password, name='resident_admin_reset_password'),
    path('admin/<int:user_id>/deactivate/', views.admin_deactivate_resident, name='resident_admin_deactivate'),
    path('admin/<int:user_id>/reactivate/', views.admin_reactivate_resident, name='resident_admin_reactivate'),
    path('admin/<int:user_id>/archive/', views.admin_archive_resident, name='resident_admin_archive'),
    path('admin/<int:user_id>/unarchive/', views.admin_unarchive_resident, name='resident_admin_unarchive'),
    path('admin/<int:user_id>/delete/', views.admin_delete_resident, name='resident_admin_delete'),
    path('verification/admin/', views.admin_verification_requests, name='admin_verification_requests'),
    path('verification/admin/<int:request_id>/', views.admin_review_verification_request, name='admin_verification_review'),
]
