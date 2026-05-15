'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const CONSENT_KEY = 'behalf_cookie_consent';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    console.log('[CookieBanner] mounted');
    try {
      const val = localStorage.getItem(CONSENT_KEY);
      console.log('[CookieBanner] stored value:', val);
      if (!val) {
        console.log('[CookieBanner] no consent stored — showing banner');
        setVisible(true);
      }
    } catch (err) {
      console.error('[CookieBanner] localStorage unavailable:', err);
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie preferences" aria-modal="false">
      <div className="cookie-banner__inner">
        <p className="cookie-banner__text">
          We use cookies to keep you signed in and measure site usage anonymously.{' '}
          <Link href="/privacy" className="cookie-banner__link">Privacy policy</Link>
        </p>
        <div className="cookie-banner__actions">
          <button className="cookie-banner__btn cookie-banner__btn--decline" onClick={decline}>
            Essential only
          </button>
          <button className="cookie-banner__btn cookie-banner__btn--accept" onClick={accept}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
