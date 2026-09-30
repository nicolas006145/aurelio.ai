import { useState, useRef, useEffect } from "react";
import { Globe, Check } from "lucide-react";
import { useI18n, SUPPORTED_LANGUAGES } from "@/i18n/I18nContext";

export function LanguageSelector({ compact = true, className = "" }) {
  const { language, setLanguage, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("app.language")}
        title={t("app.language")}
        className={`flex items-center gap-1.5 h-9 rounded-full border border-[var(--border)] px-3 text-[var(--text-secondary)] hover:text-[var(--terracotta)] hover:border-[var(--border-accent)] transition-colors ${compact ? "text-xs" : "text-sm"}`}
      >
        <Globe size={compact ? 14 : 16} />
        <span className="font-medium">{current.flag}</span>
        {!compact && <span className="uppercase tracking-wider">{current.code}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-44 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl shadow-black/20 overflow-hidden">
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLanguage(l.code);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--bg-main)] transition-colors ${
                language === l.code ? "text-[var(--terracotta)]" : "text-[var(--text-primary)]"
              }`}
            >
              <span className="text-base">{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {language === l.code && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LanguageSelector;
