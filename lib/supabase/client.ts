"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  SUPABASE_PUBLIC_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_STORAGE_KEY,
} from "./config";

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (!_client) {
    _client = createBrowserClient(SUPABASE_PUBLIC_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: SUPABASE_STORAGE_KEY },
    });
  }
  return _client;
}
