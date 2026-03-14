import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { AiConciergeShell } from "../components/ai-concierge-shell";
import { PrivacyFooter } from "../components/privacy-footer";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display"
});

const sans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans"
});

export const metadata: Metadata = {
  title: "Balea Sphere",
  description:
    "A curated AI-powered access network for Mallorca and the Balearic business ecosystem."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="font-[var(--font-sans)] antialiased">
        {children}
        <PrivacyFooter />
        <AiConciergeShell />
      </body>
    </html>
  );
}
