"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DICT, translate } from "@/lib/i18n";

const LangContext = createContext({ lang: "en", setLang: () => {}, t: (k, ...a) => translate("en", k, ...a) });

// Remembers the chosen language in the browser; German and French browsers start in their language
export function LangProvider({ children }) {
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem("peron-lang"); } catch {}
    if (saved && DICT[saved]) setLangState(saved);
    else {
      const nav = (navigator.language || "").toLowerCase().slice(0, 2);
      if (DICT[nav]) setLangState(nav);
    }
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem("peron-lang", l); } catch {}
  }, []);

  const t = useCallback((k, ...a) => translate(lang, k, ...a), [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
