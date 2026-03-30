"""课程模块路由"""
from django.urls import path

from . import views

urlpatterns = [
    path("", views.list_courses),
    path("enrollments/<str:student_id>/", views.student_enrollments),
    path("attendance/<str:student_id>/", views.attendance_summary),
]
