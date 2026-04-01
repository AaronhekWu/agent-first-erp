"""财务模块路由"""
from django.urls import path

from . import views

urlpatterns = [
    path("accounts/<str:student_id>/", views.get_account),
    path("transactions/<str:student_id>/", views.get_transactions),
    path("recharge/", views.create_recharge),
]
