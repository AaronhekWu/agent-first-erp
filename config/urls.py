"""
主 URL 路由配置
"""
from django.urls import include, path

urlpatterns = [
    # 健康检查
    path("health/", include("apps.core.urls")),
    # 业务模块
    path("api/v1/accounts/", include("apps.accounts.urls")),
    path("api/v1/students/", include("apps.students.urls")),
    path("api/v1/courses/", include("apps.courses.urls")),
    path("api/v1/followups/", include("apps.followups.urls")),
    path("api/v1/agents/", include("apps.agents.urls")),
    path("api/v1/audits/", include("apps.audits.urls")),
]
