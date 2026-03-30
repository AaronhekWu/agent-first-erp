"""审计模块路由"""
from django.urls import path

from . import views

urlpatterns = [
    path("operations/", views.operation_logs),
    path("agent-calls/<str:session_id>/", views.agent_call_logs),
]
