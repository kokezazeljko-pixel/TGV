import { Barlow_Condensed, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { LangProvider } from "@/components/LangProvider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const display = Barlow_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = Source_Sans_3({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-mono" });

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Train Punctuality – train delays in France and Switzerland", template: "%s · Train Punctuality" },
  description: "How late is your train in France (TGV) and Switzerland (IC, IR, EC), and what passengers on board are saying. Retards des trains et avis des voyageurs.",
  alternates: { canonical: "/" },
  openGraph: { title: "Train Punctuality – train delays in France and Switzerland", description: "Live train delays in France and Switzerland and reports from passengers on board.", url: "/", siteName: "Train Punctuality", type: "website" },
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
      </body>
    </html>
  );
}
