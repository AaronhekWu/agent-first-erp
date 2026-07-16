// Edge Function: students-create
// 包装 rpc_create_student, 后续可加业务校验/通知/审计扩展
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface CreateStudentBody {
  p_name: string;
  p_phone?: string | null;
  p_gender?: string | null;
  p_birth_date?: string | null;
  p_email?: string | null;
  p_school?: string | null;
  p_grade?: string | null;
  p_source?: string | null;
  p_notes?: string | null;
  p_assigned_to?: string | null;
  p_department_id?: string | null;
  p_operator_id?: string | null;
  p_parent_name?: string | null;
  p_parent_phone?: string | null;
  p_parent_relation?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body: CreateStudentBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "INVALID_JSON" }, 400);
  }
  if (!body?.p_name || body.p_name.trim().length === 0) {
    return jsonResponse({ error: "INVALID_INPUT: 姓名必填" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    },
  );

  const { data, error } = await supabase.rpc("rpc_create_student", body);
  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse({ data });
});
