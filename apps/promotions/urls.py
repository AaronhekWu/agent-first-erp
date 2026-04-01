"""促销模块路由"""
from django.urls import path

from . import views

urlpatterns = [
    path("campaigns/", views.list_campaigns),
    path("campaigns/create/", views.create_campaign),
    path("campaigns/<str:campaign_id>/", views.campaign_detail),
    path("referrals/create/", views.create_referral),
    path("referrals/<str:student_id>/", views.student_referrals),
]
