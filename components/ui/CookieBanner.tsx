"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CONSENT_KEY = "behalf_cookie_consent";

// Inline translations so this works outside next-intl provider (dashboard, etc.)
const TRANSLATIONS: Record<string, { body: string; privacy: string; essential: string; accept: string; dialog: string }> = {
  de: {
    body: "Wir verwenden ein Sitzungs-Cookie, um Sie angemeldet zu halten. Es werden keine Analyse- oder Tracking-Cookies verwendet.",
    privacy: "Datenschutzrichtlinie",
    essential: "Nur notwendige",
    accept: "Alle akzeptieren",
    dialog: "Website-Einstellungen",
  },
  es: {
    body: "Usamos una cookie de sesión para mantenerte conectado. No se usan cookies de análisis ni de seguimiento.",
    privacy: "Política de privacidad",
    essential: "Solo esencial",
    accept: "Aceptar todo",
    dialog: "Preferencias del sitio",
  },
  fr: {
    body: "Nous utilisons un cookie de session pour vous maintenir connecté. Aucun cookie d'analyse ou de suivi n'est utilisé.",
    privacy: "Politique de confidentialité",
    essential: "Essentiel uniquement",
    accept: "Tout accepter",
    dialog: "Préférences du site",
  },
  en: {
    body: "We use a session cookie to keep you signed in. No analytics or tracking cookies are used.",
    privacy: "Privacy policy",
    essential: "Essential only",
    accept: "Accept all",
    dialog: "Site preferences",
  },
};

function getLocale(): string {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language?.split("-")[0] ?? "en";
  return ["de", "es", "fr"].includes(lang) ? lang : "en";
}

function ping(state: string) {
  fetch("/api/consent-ping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state })
  }).catch(() => {});
}

function rememberConsent(value: "accepted" | "declined") {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [locale, setLocale] = useState("en");

  useEffect(() => {
    setLocale(getLocale());
    try {
      const val = localStorage.getItem(CONSENT_KEY);
      if (!val) {
        ping("shown");
        queueMicrotask(() => setVisible(true));
      } else {
        ping(`already-set:${val}`);
      }
    } catch {
      ping("storage-error");
      queueMicrotask(() => setVisible(true));
    }
  }, []);

  function accept() {
    rememberConsent("accepted");
    ping("accepted");
    setVisible(false);
  }

  function decline() {
    rememberConsent("declined");
    ping("declined");
    setVisible(false);
  }

  if (!visible) return null;

  const tr = TRANSLATIONS[locale] ?? TRANSLATIONS.en;
  const privacyHref = locale === "en" ? "/privacy" : `/${locale}/privacy`;

  return (
    <div className="site-consent" role="dialog" aria-label={tr.dialog} aria-modal="false">
      <div className="site-consent__inner">
        <p className="site-consent__text">
          {tr.body}{" "}
          <Link href={privacyHref} className="site-consent__link">{tr.privacy}</Link>
        </p>
        <div className="site-consent__actions">
          <button className="site-consent__btn site-consent__btn--decline" onClick={decline} type="button">
            {tr.essential}
          </button>
          <button className="site-consent__btn site-consent__btn--accept" onClick={accept} type="button">
            {tr.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
