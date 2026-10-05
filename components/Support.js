"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/components/LangProvider";
import { KOFI_URL } from "@/lib/site";

// "Support" button and a small window explaining donations (through Ko-fi)
export default function SupportButton({ className = "supportbtn" }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>♥ {t("support")}</button>
      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="support-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-x" aria-label={t("close")} onClick={() => setOpen(false)}>×</button>
            <div className="modal-heart" aria-hidden="true">♥</div>
            <h3 id="support-title">{t("supportTitle")}</h3>
            <p>{t("supportText")}</p>
            <ul className="modal-list">
              <li>{t("supportUse1")}</li>
              <li>{t("supportUse2")}</li>
              <li>{t("supportUse3")}</li>
            </ul>
            <a className="primary kofi" href={KOFI_URL} target="_blank" rel="noopener noreferrer">☕ {t("supportBtn")}</a>
            <p className="muted small">{t("supportNote")}</p>
          </div>
        </div>
      )}
    </>
  );
}
