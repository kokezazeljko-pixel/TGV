// Ko-fi webhook: Ko-fi calls this address after every payment (donation, shop item, membership).
// A payment unlocks earlier days for the site account with the same email (public.kofi_grant):
// 1 = 1 day, 20 or more = 30 days, a monthly Ko-fi membership payment = 31 days. Set the secret KOFI_VERIFICATION_TOKEN in Supabase → Edge Functions →
// Secrets (Ko-fi → Settings → API → Webhooks shows the token), and put this function's URL in Ko-fi.
// verify_jwt is off on purpose: Ko-fi cannot send a Supabase token, the verification token is checked instead.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// tolerant of spaces or quotes picked up when the token was pasted into Secrets
const clean = (v: unknown) => String(v ?? "").trim().replace(/^["']|["']$/g, "").trim();
const TOKEN = clean(Deno.env.get("KOFI_VERIFICATION_TOKEN"));

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
  if (clean(data.verification_token) !== TOKEN) {
    // say only what kind of mismatch it is (lengths), never the token itself
    console.log(JSON.stringify({ rejected: "token mismatch", got_len: clean(data.verification_token).length, secret_len: TOKEN.length }));
    return json({ error: "forbidden" }, 403);
  }

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
