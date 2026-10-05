import { Barlow_Condensed, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { LangProvider } from "@/components/LangProvider";
import { SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next"; // visitor statistics without cookies (Vercel Web Analytics)
import "./globals.css";

const display = Barlow_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = Source_Sans_3({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-mono" });

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Train Punctuality – train delays in France, Switzerland, Belgium and the Netherlands", template: "%s · Train Punctuality" },
  description: "How late is your train in France (TGV), Switzerland (IC, IR, EC), Belgium (IC, EC) and the Netherlands (NS Intercity, ICE, Eurostar), and what passengers on board are saying. Zugverspätungen und Berichte von Reisenden. Retards des trains et avis des voyageurs. Treinvertragingen en meldingen van reizigers.",
  alternates: { canonical: "/" },
  openGraph: { title: "Train Punctuality – train delays in France, Switzerland, Belgium and the Netherlands", description: "Live train delays in France, Switzerland, Belgium and the Netherlands and reports from passengers on board.", url: "/", siteName: "Train Punctuality", type: "website" },
};

export const viewport = { themeColor: "#16233f" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <LangProvider>
          <Header />
          <main className="wrap">{children}</main>
          <Footer />
        </LangProvider>
        <Analytics />
      </body>
    </html>
  );
}
