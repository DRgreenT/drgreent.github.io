import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://artcxskvrbvxcwybcblx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_XAiOftT-_u-pgSWguvYE3Q_WPbmaWyP";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 👇 DEBUG ONLY (kannst du später wieder entfernen)
window.sb = sb;

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}