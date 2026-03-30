"""账户模块路由"""
from django.urls import path

from . import views

urlpatterns = [
    path("roles/", views.list_roles),
    path("departments/", views.list_departments),
]
