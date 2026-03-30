"""跟进模块路由"""
from django.urls import path

from . import views

urlpatterns = [
    path("create/", views.create_followup),
    path("reminders/", views.pending_reminders),
    path("<str:student_id>/", views.followup_history),
]
