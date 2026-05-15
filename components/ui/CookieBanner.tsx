'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const CONSENT_KEY = 'behalf_cookie_consent';

function ping(state: string) {
  fetch('/api/consent-ping', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state }),
  }).catch(() => {});
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    console.log('[CookieBanner] mounted');
    try {
      const val = localStorage.getItem(CONSENT_KEY);
      console.log('[CookieBanner] stored value:', val);
      if (!val) {
        console.log('[CookieBanner] no consent stored — showing banner');
        ping('shown');
        setVisible(true);
      } else {
        ping('already-set:' + val);
      }
    } catch (err) {
      console.error('[CookieBanner] localStorage unavailable:', err);
      ping('storage-error');
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    ping('accepted');
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, 'declined');
    ping('declined');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="site-consent" role="dialog" aria-label="Cookie preferences" aria-modal="false">
      <div className="site-consent__inner">
        <p className="site-consent__text">
          We use cookies to keep you signed in and measure site usage anonymously.{' '}
          <Link href="/privacy" className="site-consent__link">Privacy policy</Link>
        </p>
        <div className="site-consent__actions">
          <button className="site-consent__btn site-consent__btn--decline" onClick={decline}>
            Essential only
          </button>
          <button className="site-consent__btn site-consent__btn--accept" onClick={accept}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
