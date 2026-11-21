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
  // home page in search results: Google shows ~60 characters of the title and ~155 of the description (21.11.2026:
  // 246 impressions, 1.2 % clicks with the long title); every other page sets its own title
  title: { default: "Live Train Delays in Europe – TGV, ICE, AVE, Eurostar", template: "%s · Train Punctuality" },
  applicationName: "Train Punctuality", // the name a browser shows when the site is saved or installed
  appleWebApp: { title: "Train Punctuality" },
  description: "Is your train late? Live delays and 7-day punctuality of every TGV, ICE, AVE, Eurostar and Intercity in 9 European countries, on a live map.",
  alternates: { canonical: "/" },
  openGraph: { title: "Live Train Delays in Europe – TGV, ICE, AVE, Eurostar · Train Punctuality", description: "Live delays of high-speed and long-distance trains in France, Switzerland, Belgium, the Netherlands, Luxembourg, Germany, Austria, Spain and Portugal and reports from passengers on board.", url: "/", siteName: "Train Punctuality", type: "website" },
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
