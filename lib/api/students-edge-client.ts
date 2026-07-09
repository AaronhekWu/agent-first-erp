"use client";

export interface BatchDeleteResult {
  requested: number;
  deleted: number;
  students?: Array<{ id: string; name?: string }>;
}

/**
 * 批量软删除学员 —— 经同源 API 路由代理到 RDS 边缘函数 student-delete (仅管理员)。
 * 不直调 Supabase 网关: 跨域 + 自定义头会触发 OPTIONS 预检, Kong 对无 apikey 的预检 401,
 * 浏览器报 "Failed to fetch"。同源路由无预检, 会话 cookie 自动携带。
 */
export async function batchDeleteStudents(ids: string[]): Promise<BatchDeleteResult> {
  if (ids.length === 0) return { requested: 0, deleted: 0 };

  const res = await fetch("/api/students/batch-delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ student_ids: ids }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data && (data.error || data.message)) || `删除失败 (HTTP ${res.status})`,
    );
  }
  return data as BatchDeleteResult;
}
