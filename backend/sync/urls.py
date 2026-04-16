from django.urls import path
from . import views

urlpatterns = [
    path("push/", views.push_events, name="sync_push"),
    path("pull/", views.pull_events, name="sync_pull"),
]
