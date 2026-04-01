"""AI 知识库与工具模块路由"""
from django.urls import path

from . import views

urlpatterns = [
    # 知识库
    path("knowledge/", views.list_docs),
    path("knowledge/<str:doc_id>/", views.get_doc),
    path("knowledge/create/", views.create_doc),
    # 工具执行（校区助手预留接口）
    path("tools/execute/", views.execute_tool),
    path("tools/", views.list_tools),
]
