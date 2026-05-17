"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { translations, Language } from "./translations";

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.en;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("pmgt_language") as Language;
    const raf = requestAnimationFrame(() => {
      if (saved === "en" || saved === "zh") {
        setLanguage(saved);
      } else {
        // Auto-detect based on navigator
        if (navigator.language.startsWith("zh")) {
          setLanguage("zh");
        } else {
          setLanguage("en");
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("pmgt_language", lang);
    document.documentElement.lang = lang;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
