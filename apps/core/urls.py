"""核心模块路由：健康检查"""
from django.urls import path

from . import views

urlpatterns = [
    path("", views.health_check),
]
