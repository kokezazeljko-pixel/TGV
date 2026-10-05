"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

// Ready-made pictures a passenger can choose instead of a photo: [emoji, background colour]
export const PRESETS = {
  tgv: ["🚄", "#1d3d8f"], train: ["🚆", "#0f766e"], steam: ["🚂", "#7c2d12"], tram: ["🚊", "#7e22ce"],
  metro: ["🚇", "#be123c"], station: ["🚉", "#334155"], ticket: ["🎫", "#b45309"], bag: ["🧳", "#6d28d9"],
  coffee: ["☕", "#78350f"], mountain: ["🏔️", "#0369a1"], croissant: ["🥐", "#c2410c"], choc: ["🍫", "#4a2c2a"],
  clock: ["⏰", "#b91c1c"], map: ["🗺️", "#15803d"], owl: ["🦉", "#57534e"], cat: ["🐱", "#a16207"],
};

const COLORS = ["#1d3d8f", "#0f766e", "#7e22ce", "#be123c", "#b45309", "#0369a1", "#15803d", "#57534e"];
const colorOf = (s = "") => COLORS[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] || "").join("").toUpperCase() || "?";

// src: a photo address, "preset:<id>", or nothing (then the initials of the name)
export function Avatar({ src, name, size = 40, className = "" }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.5) };
  const preset = src?.startsWith("preset:") ? PRESETS[src.slice(7)] : null;
  if (preset) return <span className={`avatar ${className}`} style={{ ...style, background: preset[1] }} aria-hidden="true">{preset[0]}</span>;
  if (src && !broken && /^https:\/\//.test(src)) {
    // no-referrer: Google photos refuse requests that carry another site's address
    return <img className={`avatar ${className}`} style={style} src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return <span className={`avatar ${className}`} style={{ ...style, background: colorOf(name), fontSize: Math.round(size * 0.4) }} aria-hidden="true">{initials(name)}</span>;
}

export const avatarOf = (p) => (p?.avatar_url ? p.avatar_url : p?.avatar_preset ? `preset:${p.avatar_preset}` : null);
export const PROFILE_FIELDS = "display_name,first_name,last_name,show_real_name,avatar_url,avatar_preset,bio,home_station,home_country,fav_train,created_at";

// The signed-in user's profile; the account page sends "tp-profile" after saving so the header updates too
export function useProfile(session) {
  const [profile, setProfile] = useState(null);
  const uid = session?.user?.id;
  const load = useCallback(async () => {
    const sb = getBrowserClient();
    if (!sb || !uid) return setProfile(null);
    const { data } = await sb.from("profiles").select(PROFILE_FIELDS).eq("id", uid).maybeSingle();
    setProfile(data || null);
  }, [uid]);
  useEffect(() => {
    load();
    window.addEventListener("tp-profile", load);
    return () => window.removeEventListener("tp-profile", load);
  }, [load]);
  return { profile, reload: load };
}
