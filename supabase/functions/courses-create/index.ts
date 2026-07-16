// Edge Function: courses-create
// 包装 rpc_create_course
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface CreateCourseBody {
  p_name: string;
  p_subject: string;
  p_level: string;
  p_description?: string | null;
  p_max_capacity?: number | null;
  p_fee?: number | null;
  p_start_date?: string | null;
  p_end_date?: string | null;
  p_schedule_info?: Record<string, unknown> | null;
  p_department_id?: string | null;
  p_operator_id?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body: CreateCourseBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "INVALID_JSON" }, 400);
  }
  if (!body?.p_name || !body?.p_subject || !body?.p_level) {
    return jsonResponse({ error: "INVALID_INPUT: 课程名/学科/年级必填" }, 400);
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

  const { data, error } = await supabase.rpc("rpc_create_course", body);
  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse({ data });
});
