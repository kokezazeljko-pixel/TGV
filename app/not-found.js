"use client";

import Link from "next/link";
import { useLang } from "@/components/LangProvider";

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="narrow card stack">
      <h2>{t("notFoundTitle")}</h2>
      <p className="muted">{t("notFoundText")}</p>
      <Link className="primary" href="/">{t("toBoard")}</Link>
    </div>
  );
}
