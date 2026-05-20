import { createServerSupabase } from "@/lib/supabase/server";

export interface Company {
  id: number;
  name: string;
  slogan: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  logo_url: string | null;
  updated_at: string;
}

export async function getCompany(): Promise<Company | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("org_company")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return (data as Company | null) ?? null;
}
