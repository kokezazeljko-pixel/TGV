"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { getGeo } from "@/lib/geo";
import { parisNowMin, statusOf } from "@/lib/format";
import { useLang } from "@/components/LangProvider";

const ARROW = "M1.45 0L-0.95 1.05L-0.45 0L-0.95 -1.05Z"; // points right, rotated to the direction of travel
const TIER_A = new Set(["Lille", "Strasbourg", "Lyon", "Marseille", "Bordeaux", "Nantes", "Rennes", "Toulouse", "Montpellier", "Nice", "Genève", "Lausanne", "Bern", "Zürich", "Basel", "Lugano"]);

/**
 * Stylized map of France, Switzerland or both together, with its lines, stations and trains running now.
 * Give it a new `key` when the country changes so it starts fresh.
 * Pan/zoom is applied directly to the SVG (no React re-render while dragging);
 * sizes that must stay constant on screen use the CSS variables --u (map units per pixel),
 * --sr (station radius) and --ts (train arrow size).
 */
export default function TrainMap({ country = "fr", trains, onTrainClick, onStationClick, selectedStation, highlight, onRunning, compact }) {
  const { t } = useLang();
  const geo = getGeo(country);
  const { W, H, trainPos, trainRoute } = geo;
  const svgRef = useRef(null);
  const view = useRef({ x: 0, y: 0, w: W, h: H });
  const zoomRef = useRef(1);
  const drag = useRef({ pts: new Map(), moved: false, start: null, pinch: null });
  const [now, setNow] = useState(null);

  // Clock for train movement (every 2 s)
  useEffect(() => {
    setNow(parisNowMin());
    const id = setInterval(() => setNow(parisNowMin()), 2000);
    return () => clearInterval(id);
  }, []);

  const running = useMemo(() => {
    if (now == null) return [];
    const out = [];
    for (const tr of trains) { const p = trainPos(tr, now); if (p) out.push({ tr, p }); }
    return out;
  }, [trains, now]);
  useEffect(() => { onRunning?.(running); }, [running, onRunning]);

  const hlPaths = useMemo(() => (highlight ? trainRoute(highlight) : []), [highlight]);

  // ---- pan & zoom
  function screenMap() {
    const svg = svgRef.current, v = view.current;
    const r = svg.getBoundingClientRect();
    const s = Math.min(r.width / v.w, r.height / v.h) || 0.7;
    return { r, s, ox: (r.width - v.w * s) / 2, oy: (r.height - v.h * s) / 2 };
  }
  function applyView() {
    const svg = svgRef.current; if (!svg) return;
    const v = view.current;
    v.w = Math.min(W, Math.max(W / 10, v.w)); v.h = (v.w * H) / W;
    v.x = Math.min(W - v.w, Math.max(0, v.x)); v.y = Math.min(H - v.h, Math.max(0, v.y));
    const zoom = W / v.w; zoomRef.current = zoom;
    svg.setAttribute("viewBox", `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    const sc = screenMap().s, u = 1 / sc;
    svg.style.setProperty("--u", u.toFixed(4));
    svg.style.setProperty("--sr", (Math.pow(zoom, 0.25) * u).toFixed(4));
    svg.style.setProperty("--ts", (6.2 * 1.15 * Math.pow(zoom, 0.3) * Math.min(1, Math.sqrt(sc / 0.7)) * u).toFixed(4));
    svg.classList.toggle("z2", sc >= 1.45); svg.classList.toggle("z3", sc >= 2.2);
    svg.classList.toggle("z5", sc >= 3.6); svg.classList.toggle("small", sc < 0.55);
  }
  function zoomAt(px, py, factor) {
    const v = view.current;
    const nw = Math.min(W, Math.max(W / 10, v.w / factor)), f = nw / v.w;
    v.x = px - (px - v.x) * f; v.y = py - (py - v.y) * f; v.w = nw; v.h = (nw * H) / W;
    applyView();
  }
  const toSvg = (cx, cy) => { const m = screenMap(), v = view.current; return [v.x + (cx - m.r.left - m.ox) / m.s, v.y + (cy - m.r.top - m.oy) / m.s]; };

  useEffect(() => {
    const svg = svgRef.current;
    applyView();
    const ro = new ResizeObserver(() => {
      applyView();
      if (!compact) document.documentElement.style.setProperty("--maph", svg.parentElement.offsetHeight + "px");
    });
    ro.observe(svg);
    const onWheel = (e) => { e.preventDefault(); const [x, y] = toSvg(e.clientX, e.clientY); zoomAt(x, y, Math.exp(-e.deltaY * 0.0018)); };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => { ro.disconnect(); svg.removeEventListener("wheel", onWheel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = drag.current;
  const onPointerDown = (e) => {
    d.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (d.pts.size === 1) { d.moved = false; d.start = { cx: e.clientX, cy: e.clientY, vx: view.current.x, vy: view.current.y }; }
    if (d.pts.size === 2) { const [a, b] = [...d.pts.values()]; d.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: view.current.w }; }
  };
  const onPointerMove = (e) => {
    if (!d.pts.has(e.pointerId)) return;
    d.pts.set(e.pointerId, [e.clientX, e.clientY]);
    const sc = screenMap().s;
    if (d.pts.size === 2 && d.pinch) {
      const [a, b] = [...d.pts.values()]; const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const [mx, my] = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      zoomAt(mx, my, view.current.w / ((d.pinch.w * d.pinch.d) / dist)); d.moved = true; return;
    }
    if (d.pts.size === 1 && d.start) {
      const dx = e.clientX - d.start.cx, dy = e.clientY - d.start.cy;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 5) { d.moved = true; svgRef.current.classList.add("dragging"); try { svgRef.current.setPointerCapture(e.pointerId); } catch {} }
      if (d.moved) { view.current.x = d.start.vx - dx / sc; view.current.y = d.start.vy - dy / sc; applyView(); }
    }
  };
  const onPointerUp = (e) => {
    d.pts.delete(e.pointerId);
    if (d.pts.size < 2) d.pinch = null;
    if (!d.pts.size) { svgRef.current?.classList.remove("dragging"); setTimeout(() => { d.moved = false; }, 0); d.start = null; }
    else { const [p] = [...d.pts.values()]; d.start = { cx: p[0], cy: p[1], vx: view.current.x, vy: view.current.y }; }
  };
  const center = () => [view.current.x + view.current.w / 2, view.current.y + view.current.h / 2];

  return (
    <div className="mapbox" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        ref={svgRef} id="map" role="img" aria-label={t(country === "fr" ? "mapLabel" : "mapLabel_" + country)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      >
        <BaseMap geo={geo} />
        <GeoLabels geo={geo} />
        <Rails geo={geo} />
        <g>{hlPaths.map((pts, i) => <path key={i} className="rail hl" d={"M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L")} />)}</g>
        <Stations
          geo={geo}
          selected={selectedStation}
          onClick={(n) => { if (d.moved || !onStationClick) return; onStationClick(n.group && zoomRef.current < 5 ? n.group : n.name); }}
        />
        <g>
          {running.map(({ tr, p }) => {
            const st = statusOf(tr, t);
            return (
              <g key={tr.id} transform={`translate(${p.xy[0].toFixed(2)} ${p.xy[1].toFixed(2)})`}>
                <g className={`trn ${st.dot}`} transform={`rotate(${p.xy[2].toFixed(1)})`} onClick={(e) => { if (d.moved) return; e.stopPropagation(); onTrainClick?.(tr); }}>
                  <title>{`${tr.type} ${tr.number} · ${tr.origin} → ${tr.destination} · ${st.label}`}</title>
                  <g className="tz"><circle className="hit" r="1.5" /><path className="arrow" d={ARROW} /></g>
                </g>
                {highlight?.id === tr.id && <circle className="ring" r="1" />}
                <text className="tlabel">{tr.number}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="mapctl">
        <button type="button" title={t("zin")} aria-label={t("zin")} onClick={() => zoomAt(...center(), 1.6)}>+</button>
        <button type="button" title={t("zout")} aria-label={t("zout")} onClick={() => zoomAt(...center(), 1 / 1.6)}>−</button>
        <button type="button" className="small" title={t("zreset")} aria-label={t("zreset")} onClick={() => { view.current = { x: 0, y: 0, w: W, h: H }; applyView(); }}>⤢</button>
      </div>
      {!compact && <div className="maphint">{t("hint")}</div>}
    </div>
  );
}

// ---- static layers (rendered once)
const ring = (geo, pts) => "M" + pts.map(([lon, lat]) => geo.proj(lat, lon).map((v) => v.toFixed(1)).join(",")).join("L") + "Z";
const pathOf = (geo, path) => "M" + path.map((k) => `${geo.nodes[k].x.toFixed(1)},${geo.nodes[k].y.toFixed(1)}`).join("L");

const BaseMap = memo(function BaseMap({ geo }) {
  return (
    <g>
      {geo.NET.land.map((p, i) => <path key={"l" + i} className="land" d={ring(geo, p)} />)}
      {(geo.NET.water || []).map((p, i) => <path key={"w" + i} className="water" d={ring(geo, p)} />)}
    </g>
  );
});

const Rails = memo(function Rails({ geo }) {
  const NET = geo.NET;
  const lgv = NET.lines.filter(([type]) => type === "lgv"), classic = NET.lines.filter(([type]) => type === "classic");
  return (
    <g>
      {lgv.map(([, p], i) => <path key={"c" + i} className="rail casing" d={pathOf(geo, p)} />)}
      {classic.map(([, p], i) => <path key={"k" + i} className="rail classic" d={pathOf(geo, p)} />)}
      {lgv.map(([, p], i) => <path key={"l" + i} className="rail lgv" d={pathOf(geo, p)} />)}
    </g>
  );
});

function GeoLabels({ geo }) {
  const { t } = useLang();
  const names = t("geo");
  return (
    <g>
      {geo.NET.labels.map(([k, lon, lat]) => {
        const [x, y] = geo.proj(lat, lon);
        return <text key={k} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor="middle" className={"geo" + (["atl", "man", "med"].includes(k) ? " sea" : "")}>{names[k]}</text>;
      })}
    </g>
  );
}

const ANCHOR = { r: "start", l: "end", t: "middle", b: "middle" };
function Stations({ geo, selected, onClick }) {
  const { stations } = geo;
  const paris = geo.nodes.PGL;
  return (
    <>
      <g>
        {stations.map((n) => {
          const major = n.lvl === 1 || n.group;
          const sel = selected && (n.name === selected || n.group === selected);
          return (
            <g key={n.k} transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`}>
              <circle className={"stn" + (major ? " major" : "") + (sel ? " sel" : "")} r="1" onClick={(e) => { e.stopPropagation(); onClick(n); }}>
                <title>{n.name}</title>
              </circle>
            </g>
          );
        })}
      </g>
      <g>
        {paris && <text x={paris.x.toFixed(1)} y={paris.y.toFixed(1)} textAnchor="end" className="lbl major a grp pos-l">Paris</text>}
        {stations.filter((n) => n.lvl).map((n) => {
          const cls = n.lvl === 1 ? "lbl major " + (TIER_A.has(n.short) ? "a" : "b") : n.lvl === 5 ? "lbl l5" : "lbl l2";
          return <text key={n.k} x={n.x.toFixed(1)} y={n.y.toFixed(1)} textAnchor={ANCHOR[n.pos] || "start"} className={`${cls} pos-${n.pos || "r"}`}>{n.short}</text>;
        })}
      </g>
    </>
  );
}
