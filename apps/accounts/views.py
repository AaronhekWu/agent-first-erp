"""
账户模块视图
"""
import json

from django.http import JsonResponse
from django.views.decorators.http import require_GET

from apps.core.deps import get_account_service


@require_GET
def list_roles(request):
    """获取所有角色"""
    svc = get_account_service()
    roles = svc.list_roles()
    return JsonResponse({
        "roles": [r.model_dump(mode="json") for r in roles],
    })


@require_GET
def list_departments(request):
    """获取所有部门"""
    svc = get_account_service()
    departments = svc.list_departments()
    return JsonResponse({
        "departments": [d.model_dump(mode="json") for d in departments],
    })
