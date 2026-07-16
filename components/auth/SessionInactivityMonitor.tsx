"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const PING_DEBOUNCE_MS = 60_000;
const CHECK_INTERVAL_MS = 30_000;
const DEFAULT_INACTIVITY_MS = 60 * 60 * 1000;

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
  const inactivityMsRef = useRef(DEFAULT_INACTIVITY_MS);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const checkSessionStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include"
      });
      if (!response.ok) {
        router.replace("/login?reason=session-expired");
        return;
      }

      const body = (await response.json()) as {
        session?: { inactivityMs?: number };
      };
      if (typeof body.session?.inactivityMs === "number") {
        inactivityMsRef.current = body.session.inactivityMs;
      }
    } catch {
      // Ignore transient network errors; server-side checks remain authoritative.
    }
  }, [router]);

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
    void checkSessionStatus();

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
      void checkSessionStatus();

      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= inactivityMsRef.current) {
        void logoutDueToInactivity();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, onActivity);
      }
      window.clearInterval(interval);
    };
  }, [checkSessionStatus, pingSession, recordActivity]);

  return null;
}
