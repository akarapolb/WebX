"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Lang, translate } from "@/lib/i18n";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("webx_lang")) as Lang | null;
    if (saved === "en" || saved === "th") { setLangState(saved); document.documentElement.setAttribute("lang", saved); }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.setAttribute("lang", l);
    try { localStorage.setItem("webx_lang", l); } catch {}
  }, []);

  const t = useCallback((key: string) => translate(lang, key), [lang]);
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
