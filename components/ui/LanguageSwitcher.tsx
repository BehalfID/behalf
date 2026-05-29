"use client";

import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useParams } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";

const LOCALE_LABELS: Record<string, string> = {
  en: "EN",
  de: "DE",
  es: "ES",
  fr: "FR",
};

export function LanguageSwitcher() {
  const t = useTranslations("language");
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const locale = (params.locale as string) || "en";

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, close]);

  function switchLocale(next: string) {
    router.push(pathname, { locale: next });
    close();
  }

  return (
    <div className="lang-switcher" ref={containerRef}>
      <button
        className="lang-switcher__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("select")}
        aria-expanded={open}
        aria-haspopup="listbox"
        type="button"
      >
        {/* Globe icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="lang-switcher__globe"
        >
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
          <ellipse cx="8" cy="8" rx="2.6" ry="6.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M1.5 6h13M1.5 10h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="lang-switcher__label">{LOCALE_LABELS[locale] ?? locale.toUpperCase()}</span>
      </button>

      {open && (
        <div
          className="lang-switcher__dropdown"
          role="listbox"
          aria-label={t("select")}
        >
          {routing.locales.map((loc) => (
            <button
              key={loc}
              role="option"
              aria-selected={loc === locale}
              className={`lang-switcher__option${loc === locale ? " lang-switcher__option--active" : ""}`}
              onClick={() => switchLocale(loc)}
              type="button"
            >
              <span className="lang-switcher__option-code">{LOCALE_LABELS[loc]}</span>
              <span className="lang-switcher__option-name">{t(loc as "en" | "de" | "es" | "fr")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
