// Pushes files to the GitHub repo (kokezazeljko-pixel/TGV, branch main) as one commit, while the owner is away
// from his laptop. The GitHub token lives in Vault (github_push_token, read through the service-role-only function
// github_push_token()) and never leaves this function. Body: { message, files: [{ path, content } | { path, edits: [{ old, new }] }
// | { path, delete: true }],
// expect_head?: sha } or { check: true }. With expect_head the push is refused if main has moved (no overwrites).
// Auth: custom x-cron-token header checked against a Vault secret (verify_jwt is off on purpose).
const URL_ = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const REPO = "kokezazeljko-pixel/TGV", BRANCH = "main", API = `https://api.github.com/repos/${REPO}`;

async function rpc(fn: string, args: unknown) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  if (!r.ok) throw Error(`${fn} -> ${r.status}`);
  return r.json();
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const t = req.headers.get("x-cron-token") || "";
  if (!t || (await rpc("cron_token_ok", { t })) !== true) return json({ error: "forbidden" }, 403);
  const token = await rpc("github_push_token", {});
  if (!token) return json({ error: "github_push_token missing in Vault" }, 500);
  const GH = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "train-punctuality-push", "Content-Type": "application/json" };
  const gh = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(`${API}${path}`, { method, headers: GH, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(`GitHub ${method} ${path} -> ${r.status}: ${String(j?.message || "").slice(0, 200)}`);
    return j;
  };
  try {
    const b = await req.json().catch(() => ({}));
    const head = (await gh(`/git/ref/heads/${BRANCH}`)).object.sha as string;
    if (b.check) {
      const repo = await gh("");
      return json({ ok: true, head, permissions: repo.permissions || null });
    }
    if (b.expect_head && b.expect_head !== head) return json({ error: "main has moved", head }, 409);
    const files = Array.isArray(b.files) ? b.files : [];
    if (!files.length || !b.message) return json({ error: "message and files are required" }, 400);
    const base = (await gh(`/git/commits/${head}`)).tree.sha;
    const tree = [];
    for (const f of files) {
      if (!f.path || String(f.path).startsWith("/") || String(f.path).includes("..")) return json({ error: `bad path ${f.path}` }, 400);
      if (f.delete) { tree.push({ path: f.path, mode: "100644", type: "blob", sha: null }); continue; }
      let content = f.content;
      if (Array.isArray(f.edits)) { // small changes: each old text must occur exactly once in the file as it is on main
        const cur = await gh(`/contents/${encodeURI(f.path)}?ref=${head}`);
        const bytes = Uint8Array.from(atob(String(cur.content).replace(/\n/g, "")), (c) => c.charCodeAt(0));
        content = new TextDecoder().decode(bytes);
        for (const e of f.edits) {
          const n = content.split(e.old).length - 1;
          if (n !== 1) return json({ error: `${f.path}: text found ${n} times, expected once`, old: String(e.old).slice(0, 120) }, 409);
          content = content.replace(e.old, () => e.new);
        }
      }
      const blob = await gh("/git/blobs", "POST", f.content_b64 != null ? { content: f.content_b64, encoding: "base64" } : { content: String(content ?? ""), encoding: "utf-8" });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await gh("/git/trees", "POST", { base_tree: base, tree });
    const commit = await gh("/git/commits", "POST", { message: b.message, tree: newTree.sha, parents: [head] });
    await gh(`/git/refs/heads/${BRANCH}`, "PATCH", { sha: commit.sha });
    return json({ ok: true, commit: commit.sha, previous: head, files: files.length, url: `https://github.com/${REPO}/commit/${commit.sha}` });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
