import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

let browserClient;

// Browser client: remembers the signed-in user
export function getBrowserClient() {
  if (!isConfigured) return null;
  if (!browserClient) browserClient = createClient(url, key);
  return browserClient;
}

// Server client (Next.js server components): public data only, no sign-in
export function getServerClient() {
  if (!isConfigured) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
