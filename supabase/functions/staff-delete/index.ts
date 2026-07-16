// Edge Function: staff-delete (soft delete via is_active=false)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: { p_id: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: "INVALID_JSON" }, 400); }
  if (!body?.p_id) return jsonResponse({ error: "INVALID_INPUT: p_id 必填" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await supabase.rpc("rpc_delete_staff", body);
  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ data });
});
