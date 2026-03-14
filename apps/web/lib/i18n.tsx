"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import en from "../messages/en.json";
import de from "../messages/de.json";

export type Locale = "en" | "de";
const messages = { en, de } as const;

type LangCtxValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
};

const LangCtx = createContext<LangCtxValue>({
  locale: "en",
  setLocale: () => {},
  t: (k) => k,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem("bs_locale") as Locale | null;
    if (saved === "en" || saved === "de") setLocaleState(saved);
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem("bs_locale", l);
  }

  function t(key: string): string {
    const parts = key.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let val: any = messages[locale];
    for (const p of parts) val = val?.[p];
    if (typeof val === "string") return val;
    // fallback to English
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let enVal: any = messages.en;
    for (const p of parts) enVal = enVal?.[p];
    return typeof enVal === "string" ? enVal : key;
  }

  return <LangCtx.Provider value={{ locale, setLocale, t }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}
