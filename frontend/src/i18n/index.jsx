import { createContext, useContext, useState, useCallback } from "react";
import en from "./en.json";
import tr from "./tr.json";

const LANGS = { en, tr };

const I18nContext = createContext();

export function I18nProvider({ initialLang = "en", children }) {
  const [lang, setLang] = useState(initialLang);

  const t = useCallback(
    (key) => {
      const parts = key.split(".");
      let val = LANGS[lang];
      for (const p of parts) {
        if (val && typeof val === "object") val = val[p];
        else return key;
      }
      return typeof val === "string" ? val : key;
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
