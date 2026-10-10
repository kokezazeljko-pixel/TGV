"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { getGeo } from "@/lib/geo";
import { parisNowMin, statusOf } from "@/lib/format";
import { useLang } from "@/components/LangProvider";

const ARROW = "M1.45 0L-0.95 1.05L-0.45 0L-0.95 -1.05Z"; // points right, rotated to the direction of travel
const TIER_A = new Set(["Lille", "Strasbourg", "Lyon", "Marseille", "Bordeaux", "Nantes", "Rennes", "Toulouse", "Montpellier", "Nice", "Genève", "Lausanne", "Bern", "Zürich", "Basel", "Lugano", "Antwerpen", "Gent", "Liège", "Rotterdam", "Utrecht", "Eindhoven", "Groningen"]);

/**
 * Stylized map of France, Switzerland, Belgium, the Netherlands or all together, with its lines, stations and trains running now.
 * Give it a new `key` when the country changes so it starts fresh.
 * Pan/zoom is applied directly to the SVG (no React re-render while dragging);
 * sizes that must stay constant on screen use the CSS variables --u (map units per pixel),
 * --sr (station radius) and --ts (train arrow size).
 */
export const MAP_STYLES = ["classic", "dark"];

// onExpand (route view on the train page): a click on the small map, or the ⛶ button, opens it large; big = shown in that large window
export default function TrainMap({ country = "fr", trains, onTrainClick, onStationClick, selectedStation, highlight, onRunning, compact, onExpand, onFull, big }) {
  const { t } = useLang();
  // Map look chosen by the visitor (Classic / Dark), remembered in this browser
  const [mapStyle, setMapStyle] = useState("classic");
  useEffect(() => { try { const s = localStorage.getItem("tp-mapstyle"); if (MAP_STYLES.includes(s)) setMapStyle(s); } catch {} }, []);
  const chooseStyle = (s) => { setMapStyle(s); try { localStorage.setItem("tp-mapstyle", s); } catch {} };
  const geo = getGeo(country);
  const { W, H, trainPos, trainRoute } = geo;
  const svgRef = useRef(null);
  // the wheel / resize handlers are set up once: they read the current map from here, not the one of the first render
  // (otherwise, after switching from Luxembourg to Europe, zooming named every station of Europe)
  const geoRef = useRef(geo); geoRef.current = geo;
  const view = useRef({ x: 0, y: 0, w: W, h: H });
  const zoomRef = useRef(1);
  const drag = useRef({ pts: new Map(), moved: false, start: null, pinch: null });
  const [now, setNow] = useState(null);
  const [routeScale, setRouteScale] = useState(0);
  const [routeBounds, setRouteBounds] = useState(null);

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
    const v = view.current, { H, NET } = geoRef.current;
    v.w = Math.min(W, Math.max(W / 10, v.w)); v.h = (v.w * H) / W;
    v.x = Math.min(W - v.w, Math.max(0, v.x)); v.y = Math.min(H - v.h, Math.max(0, v.y));
    const zoom = W / v.w; zoomRef.current = zoom;
    svg.setAttribute("viewBox", `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    const sc = screenMap().s, u = 1 / sc;
    svg.style.setProperty("--u", u.toFixed(4));
    svg.style.setProperty("--sr", (Math.pow(zoom, 0.25) * u).toFixed(4));
    svg.style.setProperty("--ts", (6.2 * 1.15 * Math.pow(zoom, 0.3) * Math.min(1, Math.sqrt(sc / 0.7)) * u).toFixed(4));
    const all = !!NET.allNames && sc >= 0.45; // small networks (Luxembourg): every station named from the start. Always true/false: classList.toggle(c, undefined) flips the class
    // smaller stations are named only after zooming in: the screen scale alone is not enough on a big screen,
    // in full-screen mode or with the browser zoomed out (the whole map would otherwise be covered in names)
    svg.classList.toggle("z2", (sc >= 1.45 && zoom >= 1.4) || all); svg.classList.toggle("z3", sc >= 2.2 && zoom >= 1.8);
    svg.classList.toggle("z5", (sc >= 3.6 && zoom >= 2.6) || all); svg.classList.toggle("small", sc < 0.55);
    if (compact && highlight) { setRouteScale(Math.round(sc * 20) / 20); setRouteBounds({ ...v }); } // route view: labels follow the zoom
  }
  function zoomAt(px, py, factor) {
    const v = view.current, { H } = geoRef.current;
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

  // Smoothly move the view to a target rectangle
  const anim = useRef(0);
  function animateTo(target, ms = 450) {
    cancelAnimationFrame(anim.current);
    const from = { ...view.current }, t0 = performance.now();
    const step = (tm) => {
      const k = Math.min(1, (tm - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      for (const key of ["x", "y", "w"]) view.current[key] = from[key] + (target[key] - from[key]) * e;
      view.current.h = (view.current.w * H) / W;
      applyView();
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }

  // Route view (one train): fit its route, leaving room on the right for the stop names
  useEffect(() => {
    if (!compact || !highlight || !hlPaths.length) return;
    const pts = hlPaths.flat();
    const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    let w = Math.max(W / 9, (x1 - x0) * 1.8, ((y1 - y0) * 1.75 * W) / H);
    w = Math.min(W, w);
    const h = (w * H) / W;
    view.current = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h * 0.46, w, h }; // a bit lower: the style buttons sit top-left
    applyView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight?.id]);

  // Selecting a station zooms the map onto it; going back shows the whole map again
  const firstSel = useRef(true);
  useEffect(() => {
    if (compact) return;
    if (firstSel.current && !selectedStation) { firstSel.current = false; return; }
    firstSel.current = false;
    if (!selectedStation) { animateTo({ x: 0, y: 0, w: W, h: H }); return; }
    const pt = geo.stationPoint(selectedStation, trains);
    if (!pt) return;
    // Fit the station and the trains now running towards / from it, but never closer than a city-level zoom
    const nowMin = parisNowMin();
    const pts = [pt, ...trains.map((tr) => trainPos(tr, nowMin)).filter(Boolean).map((p) => p.xy)];
    let x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    let y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const minW = W / (country === "ch" || country === "be" || country === "nl" || country === "lu" || country === "pt" ? 2.6 : country === "es" || country === "de" ? 3.2 : country === "all" ? 6 : 4.5);
    let w = Math.max(minW, (x1 - x0) * 1.25, ((y1 - y0) * 1.25 * W) / H);
    w = Math.min(W, w);
    const h = (w * H) / W, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    animateTo({ x: cx - w / 2, y: cy - h / 2, w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation]);

  return (
    <div className={"mapbox style-" + mapStyle + (compact && highlight ? " routeview" : "") + (big ? " big" : "") + (onExpand ? " expandable" : "")} style={big ? undefined : { aspectRatio: compact && highlight ? "16 / 10" : `${W} / ${H}` }}>
      <svg
        ref={svgRef} id="map" role="img" aria-label={t(country === "fr" ? "mapLabel" : "mapLabel_" + country)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onClick={onExpand ? () => { if (!d.moved) onExpand(); } : undefined}
      >
        <BaseMap geo={geo} />
        <GeoLabels geo={geo} />
        <Rails geo={geo} />
        <g>{hlPaths.map((pts, i) => <path key={i} className="rail hl" d={"M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L")} />)}</g>
        {compact && highlight && <RouteStops geo={geo} tr={highlight} now={now} scale={routeScale} bounds={routeBounds} />}
        {!(compact && highlight) && <Stations
          geo={geo}
          selected={selectedStation}
          onClick={(n) => { if (d.moved || !onStationClick) return; onStationClick(n.name); }}
        />}
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
        {onExpand && <button type="button" className="small expand" title={t("mapFull")} aria-label={t("mapFull")} onClick={onExpand}>⛶</button>}
        {onFull && <button type="button" className="small expand" title={t("mapFullScreen")} aria-label={t("mapFullScreen")} onClick={onFull}>⛶</button>}
      </div>
      {onFull && <button type="button" className="fullbtn" onClick={onFull}><span aria-hidden="true">⛶</span> {t("mapFullScreen")}</button>}
      {!compact && <div className="maphint">{t("hint")}</div>}
      {(!compact || highlight) && (
        <div className="mapstyle" role="group" aria-label={t("mapStyle")}>
          {MAP_STYLES.map((s) => (
            <button key={s} type="button" aria-pressed={mapStyle === s} onClick={() => chooseStyle(s)}>{t("style_" + s)}</button>
          ))}
        </div>
      )}
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
        return <text key={k} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor="middle" className={"geo" + (["atl", "man", "med", "ns"].includes(k) ? " sea" : "")}>{names[k]}</text>;
      })}
    </g>
  );
}

const ANCHOR = { r: "start", l: "end", t: "middle", b: "middle" };

// Map pins for big stations and airport stations. Drawn in screen pixels (scaled by --u):
// the tip touches the station, the round head holds a train or plane symbol.
const isAirport = (name = "") => /a[eé]roport|airport|flughafen|saint-exup/i.test(name);
const PIN = "M0 0C-1.6-5-9-9.5-9-17.5A9 9 0 1 1 9-17.5C9-9.5 1.6-5 0 0Z";
// Material Design icons "train" and "flight" (Apache License 2.0), 24×24, placed in the pin head
const ICON_TRAIN = "M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z";
const ICON_PLANE = "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z";
export function PinShape({ airport }) {
  return (
    <>
      <path className="pin-body" d={PIN} />
      <circle className="pin-face" cy="-17.5" r="6.6" />
      <path className="pin-icon" d={airport ? ICON_PLANE : ICON_TRAIN} transform="translate(0 -17.5) scale(0.42) translate(-12 -12)" />
    </>
  );
}

function Stations({ geo, selected, onClick }) {
  const { stations } = geo;
  // one city label per group of fanned-out stations (Paris, Bruxelles / Brussel), at the group's first station
  const groupLabels = useMemo(() => { const g = {}; for (const n of stations) if (n.group && !g[n.group]) g[n.group] = n; return Object.entries(g); }, [stations]);
  const pins = useMemo(() => stations.filter((n) => n.lvl === 1 || n.group || isAirport(n.name)), [stations]);
  // Stations of one city (Paris) are only a few hundred metres apart and would cover each other,
  // so their pins are fanned out side by side (west to east) with a thin line to the real spot.
  const spread = useMemo(() => {
    const out = {}, byGroup = {};
    for (const n of stations) if (n.group) (byGroup[n.group] ||= []).push(n);
    for (const list of Object.values(byGroup)) {
      list.sort((a, b) => a.lon - b.lon);
      list.forEach((n, i) => { out[n.k] = { dx: (i - (list.length - 1) / 2) * 21, dy: -9, ly: i % 2 ? -42 : -30 }; });
    }
    return out;
  }, [stations]);
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
      <g className="pins">
        {pins.map((n) => {
          const sel = selected && (n.name === selected || n.group === selected);
          const air = isAirport(n.name);
          const sp = spread[n.k];
          return (
            <g key={n.k} className={"pin" + (air ? " air" : "") + (sel ? " sel" : "") + (sp ? " spread" : "")} transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`} style={sp ? { "--dx": sp.dx, "--dy": sp.dy } : undefined}>
              {sp && <g className="lead"><line x2={sp.dx} y2={sp.dy} /></g>}
              <g className="pz" onClick={(e) => { e.stopPropagation(); onClick(n); }}>
                <title>{n.name}</title><PinShape airport={air} />
                {sp && <text className="pinlbl" y={sp.ly}>{n.short}</text>}
              </g>
            </g>
          );
        })}
      </g>
      <g>
        {groupLabels.map(([name, n]) => <text key={name} x={n.x.toFixed(1)} y={n.y.toFixed(1)} textAnchor="end" className="lbl major a grp pos-l">{name}</text>)}
        {stations.filter((n) => n.lvl).map((n) => {
          const cls = n.lvl === 1 ? "lbl major " + (TIER_A.has(n.short) ? "a" : "b") : n.lvl === 5 ? "lbl l5" : n.lvl === 3 ? "lbl l3" : "lbl l2";
          if (n.group) return null; // their names sit on the fanned-out pins
          const pinned = n.lvl === 1 || isAirport(n.name) ? " pinned" : "";
          return <text key={n.k} x={n.x.toFixed(1)} y={n.y.toFixed(1)} textAnchor={ANCHOR[n.pos] || "start"} className={`${cls}${pinned} pos-${n.pos || "r"}`}>{n.short}</text>;
        })}
      </g>
    </>
  );
}

// Stops of one train on the route view: name, timetable time and delay. Stops already passed are filled.
// Each name tries the right side, then left, below and above, and is left out if it would overlap
// another name or run off the map. First/last stop and big cities get their place first.
function RouteStops({ geo, tr, now, scale, bounds }) {
  const st = (tr.stops || []).filter((s) => geo.stopNode(s));
  const last = st.length - 1;
  const px = scale || 0.7; // screen pixels per map unit
  const clean = (s) => s.name.replace(/ Hall \d.*$/, "");
  const rank = (i) => (i === 0 || i === last ? 3 : TIER_A.has(geo.stopNode(st[i]).short) ? 2 : geo.stopNode(st[i]).lvl === 1 ? 1 : 0);
  const order = st.map((s, i) => i).sort((a, b) => rank(b) - rank(a) || a - b);
  const placed = st.map((s) => { const n = geo.stopNode(s), r = 7 / px; return { x0: n.x - r, x1: n.x + r, y0: n.y - r, y1: n.y + r }; }); // the dots themselves
  const show = new Map();
  const b = bounds || { x: -1e9, y: -1e9, w: 2e9, h: 2e9 };
  for (const i of order) {
    const n = geo.stopNode(st[i]);
    const end = i === 0 || i === last;
    const wu = ((clean(st[i]).length + (st[i].delay >= 1 ? 10 : 7)) * (end ? 6.8 : 6.2) + 4) / px, hu = 16 / px, g = 10 / px;
    const cands = [
      ["r", n.x + g, n.y - hu / 2], ["l", n.x - g - wu, n.y - hu / 2],
      ["b", n.x - wu / 2, n.y + g * 0.8], ["t", n.x - wu / 2, n.y - g * 0.8 - hu],
    ];
    for (const [side, x0, y0] of cands) {
      const box = { x0, x1: x0 + wu, y0, y1: y0 + hu };
      if (box.x0 < b.x || box.x1 > b.x + b.w || box.y0 < b.y || box.y1 > b.y + b.h) continue;
      if (placed.some((q, k) => k !== i && q.x0 < box.x1 && box.x0 < q.x1 && q.y0 < box.y1 && box.y0 < q.y1)) continue;
      placed.push(box); show.set(i, side); break;
    }
    if (end && !show.has(i)) { // the first and last stop are always named: take a side that stays on the map, even if it is tight
      const fit = cands.find(([, x0, y0]) => x0 >= b.x && x0 + wu <= b.x + b.w && y0 >= b.y && y0 + hu <= b.y + b.h);
      const [side, x0, y0] = fit || cands[1];
      placed.push({ x0, x1: x0 + wu, y0, y1: y0 + hu }); show.set(i, side);
    }
  }
  const ANCH = { r: "start", l: "end", b: "middle", t: "middle" };
  return (
    <g className="rstops">
      {st.map((s, i) => {
        const n = geo.stopNode(s);
        const passed = now != null && toMinLocal(s.time) + (s.delay || 0) < now - 1;
        const end = i === 0 || i === last;
        const side = show.get(i);
        return (
          <g key={i} transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`} className={"rs" + (end ? " end" : "") + (passed ? " passed" : "")}>
            <circle className="rs-dot" r="1"><title>{`${s.name} ${s.time}`}</title></circle>
            {side && (
              <text className={"rs-lbl side-" + side} textAnchor={ANCH[side]}>
                {clean(s)}
                <tspan className="rs-time">{"  " + s.time}</tspan>
                {s.delay >= 1 && <tspan className="rs-delay">{` +${s.delay}`}</tspan>}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
const toMinLocal = (hhmm) => { if (!hhmm) return 0; const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
