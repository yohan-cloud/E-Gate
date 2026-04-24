from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

urlpatterns = [
    # 👥 Registration endpoints
    path("register/resident/", views.register_resident, name="register_resident"),
    path("register/admin/", views.register_admin, name="register_admin"),
    path("register/gate-operator/", views.register_gate_operator, name="register_gate_operator"),
    path("gate-operators/", views.list_gate_operators, name="list_gate_operators"),
    path("gate-operators/<int:user_id>/reset-password/", views.reset_gate_operator_password, name="reset_gate_operator_password"),
    path("gate-operators/<int:user_id>/set-active/", views.toggle_gate_operator_active, name="toggle_gate_operator_active"),
    path("gate-operators/<int:user_id>/delete/", views.delete_gate_operator, name="delete_gate_operator"),

    # 🔐 Authentication endpoints
    path("login/", views.login_user, name="login_user"),
    path("login/resident/", views.login_resident, name="login_resident"),
    path("login/admin/", views.login_admin, name="login_admin"),
    path("logout/", views.logout_user, name="logout_user"),
    path("password/otp/request/", views.request_password_reset_code, name="password_reset_request"),
    path("password/otp/verify/", views.reset_password_with_code, name="password_reset_verify"),

    # JWT maintenance
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("token/verify/", TokenVerifyView.as_view(), name="token_verify"),
]

