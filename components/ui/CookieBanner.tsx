"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CONSENT_KEY = "behalf_cookie_consent";

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

  useEffect(() => {
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

  return (
    <div className="site-consent" role="dialog" aria-label="Site preferences" aria-modal="false">
      <div className="site-consent__inner">
        <p className="site-consent__text">
          We use a session cookie to keep you signed in. No analytics or tracking cookies are used.{" "}
          <Link href="/privacy" className="site-consent__link">Privacy policy</Link>
        </p>
        <div className="site-consent__actions">
          <button className="site-consent__btn site-consent__btn--decline" onClick={decline} type="button">
            Essential only
          </button>
          <button className="site-consent__btn site-consent__btn--accept" onClick={accept} type="button">
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
