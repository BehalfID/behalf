"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { SESSION_INACTIVITY_MS } from "@/lib/developerAuth";

const PING_DEBOUNCE_MS = 60_000;
const CHECK_INTERVAL_MS = 30_000;

async function logoutDueToInactivity() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });
  } catch {
    // Best-effort logout before redirect.
  }

  window.location.assign("/login?reason=session-expired");
}

/**
 * Signs users out after one hour without activity. Server-side session checks
 * enforce the same inactivity window; this keeps the browser cookie fresh and
 * handles idle tabs.
 */
export function SessionInactivityMonitor() {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const lastPingRef = useRef(0);
  const pingInFlightRef = useRef(false);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const pingSession = useCallback(async () => {
    if (pingInFlightRef.current) return;
    pingInFlightRef.current = true;
    try {
      const response = await fetch("/api/auth/session/ping", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });
      if (response.status === 401) {
        router.replace("/login?reason=session-expired");
      }
    } catch {
      // Ignore transient network errors; server-side checks remain authoritative.
    } finally {
      pingInFlightRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

    const onActivity = () => {
      recordActivity();
      const now = Date.now();
      if (now - lastPingRef.current >= PING_DEBOUNCE_MS) {
        lastPingRef.current = now;
        void pingSession();
      }
    };

    for (const event of events) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= SESSION_INACTIVITY_MS) {
        void logoutDueToInactivity();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, onActivity);
      }
      window.clearInterval(interval);
    };
  }, [pingSession, recordActivity]);

  return null;
}
