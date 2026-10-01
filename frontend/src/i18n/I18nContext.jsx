import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import pt from "./locales/pt";
import en from "./locales/en";
import es from "./locales/es";

const I18nContext = createContext(null);
const STORAGE_KEY = "aurelio_language";

const _currentLangRef = { current: "pt" };

export function getCurrentLanguage() {
  return _currentLangRef.current;
}

export const SUPPORTED_LANGUAGES = [
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
];

const LOCALES = { pt, en, es };

const LANG_ALIASES = {
  "pt-br": "pt",
  "pt-pt": "pt",
  "pt": "pt",
  "en-us": "en",
  "en-gb": "en",
  "en": "en",
  "es-es": "es",
  "es-ar": "es",
  "es-mx": "es",
  "es": "es",
};

const LANG_TO_HREFLANG = {
  pt: "pt-BR",
  en: "en",
  es: "es",
};

const HREFLANG_CODES = ["pt-BR", "en", "es"];

function getHref() {
  if (typeof window === "undefined") return "";
  return window.location.href;
}

function upsertHreflangs() {
  if (typeof document === "undefined") return;
  const head = document.head;
  const href = getHref();
  HREFLANG_CODES.forEach((code) => {
    let link = head.querySelector(`link[rel="alternate"][hreflang="${code}"]`);
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "alternate");
      link.setAttribute("hreflang", code);
      head.appendChild(link);
    }
    link.setAttribute("href", href);
  });
  let xdef = head.querySelector('link[rel="alternate"][hreflang="x-default"]');
  if (!xdef) {
    xdef = document.createElement("link");
    xdef.setAttribute("rel", "alternate");
    xdef.setAttribute("hreflang", "x-default");
    head.appendChild(xdef);
  }
  xdef.setAttribute("href", href);
}

function detectBrowserLanguage() {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav) return "pt";
    const candidates = [];
    if (nav.language) candidates.push(nav.language);
    if (nav.languages && nav.languages.length) candidates.push(...nav.languages);
    for (const raw of candidates) {
      const normalized = String(raw || "").toLowerCase().trim();
      if (!normalized) continue;
      if (LANG_ALIASES[normalized]) return LANG_ALIASES[normalized];
      const short = normalized.split("-")[0];
      if (LANG_ALIASES[short]) return LANG_ALIASES[short];
    }
  } catch {}
  return "pt";
}

function get(obj, path, fallback) {
  if (obj == null) return fallback ?? path;
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return fallback ?? path;
    cur = cur[p];
  }
  if (cur == null) return fallback ?? path;
  return cur;
}

function interpolate(str, vars) {
  if (typeof str !== "string" || !vars) return str;
  let out = str;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`\\{${k}\\}`, "g");
    out = out.replace(re, String(v == null ? "" : v));
  }
  return out;
}

function translate(locale, code, key, vars) {
  const dict = LOCALES[locale] || LOCALES.pt;
  const fallbackDict = LOCALES.pt;
  let value = get(dict, key, undefined);
  if (value === undefined) value = get(fallbackDict, key, key);
  if (Array.isArray(value)) {
    return value.map((v) => interpolate(v, vars));
  }
  return interpolate(value, vars);
}

export function I18nProvider({ children }) {
  const initialRef = useRef(null);
  if (initialRef.current === null) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LOCALES[saved]) initialRef.current = saved;
    } catch {}
    if (!initialRef.current) initialRef.current = detectBrowserLanguage();
  }
  const [language, setLanguageState] = useState(initialRef.current);

  useEffect(() => {
    _currentLangRef.current = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
      if (typeof document !== "undefined") {
        const hreflang = LANG_TO_HREFLANG[language] || language;
        document.documentElement.setAttribute("lang", hreflang);
        upsertHreflangs();
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("aurelio:lang-changed", { detail: { language } }));
      }
    } catch {}
  }, [language]);

  const setLanguage = useCallback((code) => {
    if (LOCALES[code]) {
      setLanguageState(code);
    }
  }, []);

  const t = useCallback(
    (key, vars) => translate(language, SUPPORTED_LANGUAGES.find((l) => l.code === language)?.label || "pt", key, vars),
    [language]
  );

  const translateArray = useCallback(
    (key, vars) => {
      const val = translate(language, "pt", key, vars);
      return Array.isArray(val) ? val : [val];
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      translateArray,
      supported: SUPPORTED_LANGUAGES,
    }),
    [language, setLanguage, t, translateArray]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
};

export default I18nContext;
