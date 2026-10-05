"use client";

import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import SupportButton from "@/components/Support";

export default function Footer() {
  const { t } = useLang();
  return (
    <footer className="foot">
      <div className="wrap">
        <span>© {new Date().getFullYear()} {SITE_NAME}</span>
        <span>{t("dataSource")}</span>
        <Link href="/privacy">{t("privacy")}</Link>
        <a href={`mailto:${CONTACT_EMAIL}`}>{t("contact")}</a>
        <SupportButton className="supportbtn foot-link" />
      </div>
    </footer>
  );
}
