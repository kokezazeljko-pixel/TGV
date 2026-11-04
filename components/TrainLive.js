"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { TRAIN_FIELDS, parisDate, statusOf, isScheduleOnly, serviceMin, parisNowMin, toMin, stopMins, trainHref } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { TP, fill } from "@/lib/trainpage";

// Today's run of one train on its search-engine page: loaded in the browser, so the page itself can stay
// cached for days while the delay shown is always the live one.
export default function TrainLive({ country, type, number, lang }) {
  const L = TP[lang] || TP.en;
  const t = (k, ...a) => translate(lang === "pt" ? "es" : lang, k, ...a);
  const [state, setState] = useState({ loading: true, train: null });

  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) { setState({ loading: false, train: null }); return; }
    let alive = true;
    const load = async () => {
      const days = [parisDate(-1), parisDate(0)];
      const { data } = await sb.from("trains").select(TRAIN_FIELDS).eq("country", country).eq("number", number).eq("type", type).in("service_date", days);
      if (!alive) return;
      const rows = (data || []).sort((a, b) => a.service_date.localeCompare(b.service_date));
      // yesterday's run only while it is still on its way after midnight (night trains)
      const now = parisNowMin();
      const running = rows.find((r) => {
        if (r.service_date !== days[0]) return false;
        const m = stopMins(r.stops);
        return m.length && serviceMin(r, now) <= m[m.length - 1] + (r.delay_min || 0) + 30;
      });
      setState({ loading: false, train: running || rows.find((r) => r.service_date === days[1]) || null });
    };
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [country, type, number]);

  const tr = state.train;
  let line;
  if (state.loading) line = <span className="muted">{L.loading}</span>;
  else if (!tr) line = <span className="muted">{L.notToday}</span>;
  else {
    const st = statusOf(tr, t);
    const departed = serviceMin(tr, parisNowMin()) >= toMin(tr.dep);
    line = (
      <>
        <span className={`pill ${st.cls}`}>{st.label}</span>{" "}
        <span className="muted">{isScheduleOnly(tr) ? L.sched : !departed && !tr.cancelled && !tr.delay_min ? fill(L.notStarted, { t: tr.dep }) : ""}</span>
      </>
    );
  }

  return (
    <section className="card">
      <h3>{L.today}</h3>
      <p style={{ fontSize: "1.15em" }}>{line}</p>
      {tr && <p><Link href={trainHref(tr.id)} prefetch={false}>{L.live}</Link></p>}
    </section>
  );
}
