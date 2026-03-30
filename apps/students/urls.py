"""学员模块路由"""
from django.urls import path

from . import views

urlpatterns = [
    path("", views.list_students),
    path("search/", views.search_students),
    path("create/", views.create_student),
    path("<str:student_id>/", views.student_detail),
]
