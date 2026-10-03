import { Barlow_Condensed, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const display = Barlow_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = Source_Sans_3({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-mono" });

export const metadata = {
  title: { default: "Peron – kašnjenja TGV vozova", template: "%s · Peron" },
  description: "Koliko kasni tvoj TGV i šta kažu putnici koji su upravo u njemu.",
};

export const viewport = { themeColor: "#16233f" };

export default function RootLayout({ children }) {
  return (
    <html lang="sr-Latn" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Header />
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
