// Edge Function: staff-upsert (create or update teacher/counselor)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface Body {
  p_id?: string | null;
  p_display_name: string;
  p_phone?: string | null;
  p_email?: string | null;
  p_primary_role?: string | null;
  p_department_id?: string | null;
  p_permissions?: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: Body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "INVALID_JSON" }, 400); }
  if (!body?.p_display_name?.trim()) return jsonResponse({ error: "INVALID_INPUT: 姓名必填" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await supabase.rpc("rpc_upsert_staff", body);
  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ data });
});
