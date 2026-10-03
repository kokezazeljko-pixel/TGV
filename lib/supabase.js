import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

let browserClient;

// Klijent za pregledač: pamti prijavu korisnika
export function getBrowserClient() {
  if (!isConfigured) return null;
  if (!browserClient) browserClient = createClient(url, key);
  return browserClient;
}

// Klijent za server (Next.js server komponente): samo javni podaci, bez prijave
export function getServerClient() {
  if (!isConfigured) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
