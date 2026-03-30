"""Agent 模块路由"""
from django.urls import path

from . import views

urlpatterns = [
    path("sessions/", views.create_session),
    path("sessions/<str:session_id>/messages/", views.get_messages),
    path("tools/execute/", views.execute_tool),
    path("tools/", views.list_tools),
]
