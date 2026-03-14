"use client";
import { useLang, type Locale } from "../lib/i18n";

export function LangToggle() {
  const { locale, setLocale } = useLang();
  return (
    <div
      className="flex items-center rounded-lg overflow-hidden"
      style={{ border: "1px solid rgba(196,151,58,0.22)", background: "rgba(196,151,58,0.04)" }}
    >
      {(["en", "de"] as Locale[]).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors"
          style={{
            color: locale === l ? "var(--champagne)" : "var(--text-secondary)",
            background: locale === l ? "rgba(196,151,58,0.18)" : "transparent",
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
