"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { en, es, type MessageKey } from "@/lib/i18n/messages";

export type Locale = "en" | "es";

const STORAGE_KEY = "job-tracker.locale";
const catalogs: Record<Locale, Record<MessageKey, string>> = { en, es };
const dateLocales: Record<Locale, string> = { en: "en-US", es: "es-ES" };

type Vars = Record<string, string | number>;

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  // For values stored in English in the database (stages, channels, statuses).
  tValue: (prefix: string, value: string) => string;
  dateLocale: string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

// The saved language lives in localStorage; this in-memory copy covers blocked storage.
let memoryLocale: Locale = "en";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "en" || saved === "es" ? saved : memoryLocale;
  } catch {
    return memoryLocale;
  }
}

// The server always renders English; the client switches after hydration.
function getServerSnapshot(): Locale {
  return "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    memoryLocale = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted, but still applied for this session.
    }
    listeners.forEach((listener) => listener());
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const catalog = catalogs[locale];

    const t = (key: MessageKey, vars?: Vars) => {
      const template = catalog[key] ?? en[key] ?? key;
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        vars[name] !== undefined ? String(vars[name]) : match
      );
    };

    const tValue = (prefix: string, value: string) => {
      const key = `${prefix}.${value}` as MessageKey;
      return key in catalog ? catalog[key] : value;
    };

    return { locale, setLocale, t, tValue, dateLocale: dateLocales[locale] };
  }, [locale, setLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useI18n must be used inside LanguageProvider");
  return context;
}

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="lang-toggle" role="group" aria-label={t("nav.language")}>
      {(["en", "es"] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={locale === option ? "is-active" : ""}
          aria-pressed={locale === option}
          onClick={() => setLocale(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
