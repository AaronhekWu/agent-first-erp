"""
审计日志中间件

自动记录所有写操作（POST/PUT/PATCH/DELETE）到审计日志表。
"""
import json

from django.http import HttpRequest, HttpResponse


class AuditMiddleware:
    """
    审计中间件：拦截写操作请求，记录到审计日志

    仅在请求成功完成（2xx）时写入日志，避免记录失败操作。
    """

    WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)

        # 仅记录成功的写操作
        if (
            request.method in self.WRITE_METHODS
            and 200 <= response.status_code < 300
            and hasattr(request, "_audit_log")
        ):
            self._write_log(request)

        return response

    def _write_log(self, request: HttpRequest) -> None:
        """将审计信息写入 Supabase"""
        from apps.core.db import get_service_client
        from apps.core.constants import AuditTables

        audit_data = request._audit_log
        audit_data["ip_address"] = self._get_client_ip(request)
        audit_data["user_agent"] = request.META.get("HTTP_USER_AGENT", "")

        try:
            client = get_service_client()
            client.table(AuditTables.OPERATION_LOGS).insert(audit_data).execute()
        except Exception:
            # 审计日志写入失败不应阻断业务请求
            import logging
            logging.getLogger(__name__).exception("审计日志写入失败")

    @staticmethod
    def _get_client_ip(request: HttpRequest) -> str:
        """提取客户端真实 IP"""
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")
