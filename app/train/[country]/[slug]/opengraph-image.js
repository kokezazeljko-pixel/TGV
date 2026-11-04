import { ImageResponse } from "next/og";
import { getServerClient, isConfigured } from "@/lib/supabase";
import { COUNTRIES, parseTrainSlug, typeSlug, shortName } from "@/lib/trainpage";

// Picture shown when a train page is shared (LinkedIn, WhatsApp, X…): average delay and one coloured bar per day
// of the last 7 days. Only the colour of each day, never its minutes – the day-by-day delays stay a paid extra.
// Rendered on each request, like the page (no ISR writes); share sites fetch it once and keep their own copy.
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Train punctuality over the last 7 days";

const COLORS = { ok: "#51cf66", warn: "#ffa94d", bad: "#ff6b6b", x: "#868e96", "-": "#3a4a6b" };
const HEIGHT = { ok: 26, warn: 62, bad: 104, x: 104, "-": 10 };
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function load(country, slug) {
  if (!isConfigured || !COUNTRIES.includes(country)) return null;
  const p = parseTrainSlug(slug);
  if (!p) return null;
  const sb = getServerClient();
  const { data: info } = await sb.rpc("train_page_info", { p_country: country, p_number: p.number });
  const row = (info || []).find((r) => typeSlug(r.type) === p.type);
  if (!row) return null;
  const args = { p_country: country, p_type: row.type, p_number: p.number };
  const [{ data: week }, { data: days }] = await Promise.all([sb.rpc("train_week_summary", args), sb.rpc("train_week_days", args)]);
  return { ...row, number: p.number, week: (week || [])[0] || null, days: days || [] };
}

export default async function Image({ params }) {
  const { country, slug } = await params;
  const tr = await load(country, slug);
  const bg = "linear-gradient(135deg, #16233f, #24406e)";
  if (!tr) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: bg, color: "#fff", fontSize: 72, fontWeight: 700 }}>Train Punctuality</div>,
      size,
    );
  }
  const w = tr.week;
  const avg = w && w.live_runs > 0 && w.avg_delay != null ? Math.round(Number(w.avg_delay)) : null;
  const avgColor = avg == null ? "#adb5bd" : avg <= 5 ? COLORS.ok : avg < 15 ? COLORS.warn : COLORS.bad;
  const onTime = w && w.live_runs > 0 ? `${w.on_time} of ${w.live_runs} days on time` : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: bg, color: "#fff", padding: "56px 70px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 28, opacity: 0.75, letterSpacing: 2 }}>TRAIN PUNCTUALITY</div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 34 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>{`${tr.type} ${tr.number}`}</div>
            <div style={{ display: "flex", fontSize: 44, opacity: 0.9, marginTop: 8 }}>{`${shortName(tr.origin)} → ${shortName(tr.destination)}`}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 110, fontWeight: 700, color: avgColor, lineHeight: 1 }}>{avg == null ? "–" : `${avg} min`}</div>
            <div style={{ display: "flex", fontSize: 28, opacity: 0.75, marginTop: 6 }}>{avg == null ? "no live data yet" : "average delay, last 7 days"}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div style={{ display: "flex", fontSize: 26, opacity: 0.7, marginBottom: 14 }}>{onTime || "Last 7 days"}</div>
          <div style={{ display: "flex", alignItems: "flex-end", height: 104 }}>
            {tr.days.map((d) => (
              <div key={d.day} style={{ display: "flex", width: 110, height: HEIGHT[d.k] || 10, background: COLORS[d.k] || COLORS["-"], borderRadius: 6, marginRight: 14 }} />
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 8 }}>
            {tr.days.map((d) => (
              <div key={d.day} style={{ display: "flex", width: 110, marginRight: 14, justifyContent: "center", fontSize: 22, opacity: 0.8 }}>{WD[new Date(d.day + "T12:00:00Z").getUTCDay()]}</div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 22, opacity: 0.8 }}>
              {[["ok", "on time"], ["warn", "up to 15 min"], ["bad", "15+ min"], ["x", "cancelled"]].map(([k, label]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", marginRight: 26 }}>
                  <div style={{ display: "flex", width: 18, height: 18, borderRadius: 4, background: COLORS[k], marginRight: 8 }} />
                  {label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", fontSize: 26, opacity: 0.6 }}>trainpunctuality.com</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
