"""
Supabase 客户端管理

提供两种客户端：
- anon_client: 使用 anon key，受 RLS 策略约束，用于普通用户请求
- service_client: 使用 service_role key，绕过 RLS，用于 ToolGateway 和后台操作
"""
from functools import lru_cache

from django.conf import settings
from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_anon_client() -> Client:
    """获取匿名客户端（受 RLS 约束）"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)


@lru_cache(maxsize=1)
def get_service_client() -> Client:
    """获取服务端客户端（绕过 RLS，用于后台和 Agent 操作）"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
