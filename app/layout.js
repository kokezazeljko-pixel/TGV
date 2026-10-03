import { Barlow_Condensed, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import Header from "@/components/Header";
import { LangProvider } from "@/components/LangProvider";
import "./globals.css";

const display = Barlow_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = Source_Sans_3({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-mono" });

export const metadata = {
  title: { default: "Peron – TGV delays", template: "%s · Peron" },
  description: "How late is your TGV, and what passengers on board are saying. Retards des TGV et avis des voyageurs.",
};

export const viewport = { themeColor: "#16233f" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <LangProvider>
          <Header />
          <main className="wrap">{children}</main>
        </LangProvider>
      </body>
    </html>
  );
}
