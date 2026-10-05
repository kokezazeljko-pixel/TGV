// Ko-fi webhook: Ko-fi calls this address after every payment (donation, shop item, membership).
// A payment of 1 or more (EUR, CHF, USD…) gives the site account with the same email 24 hours of access
// to earlier days (public.kofi_grant). Set the secret KOFI_VERIFICATION_TOKEN in Supabase → Edge Functions →
// Secrets (Ko-fi → Settings → API → Webhooks shows the token), and put this function's URL in Ko-fi.
// verify_jwt is off on purpose: Ko-fi cannot send a Supabase token, the verification token is checked instead.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("KOFI_VERIFICATION_TOKEN") || "";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!TOKEN) return json({ error: "KOFI_VERIFICATION_TOKEN is not set" }, 500);
  let data: Record<string, unknown>;
  try {
    const form = await req.formData();
    data = JSON.parse(String(form.get("data") || "{}"));
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (data.verification_token !== TOKEN) return json({ error: "forbidden" }, 403);

  const args = {
    p_tx: String(data.kofi_transaction_id || data.message_id || ""),
    p_email: String(data.email || ""),
    p_amount: Number(data.amount) || 0,
    p_currency: String(data.currency || ""),
    p_kind: String(data.type || ""),
  };
  if (!args.p_tx) return json({ error: "no transaction id" }, 400);
  const res = await fetch(`${URL_}/rest/v1/rpc/kofi_grant`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const out = await res.json().catch(() => ({}));
  // never log the email address; only the outcome
  console.log(JSON.stringify({ kind: args.p_kind, amount: args.p_amount, currency: args.p_currency, ...out }));
  // Ko-fi only needs a 200 answer
  return json({ ok: res.ok });
});
