"""核心视图"""
from django.http import JsonResponse


def health_check(request):
    """健康检查端点"""
    return JsonResponse({"status": "ok"})
