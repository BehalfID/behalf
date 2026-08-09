"use client";

import { useEffect } from "react";
import { identifyUser, type AnalyticsIdentity as Identity } from "@/lib/analytics/identity";

/**
 * Reports the signed-in person to analytics.
 *
 * Mounted in the authenticated shell rather than in a sign-in handler so the
 * identity is re-asserted on every authenticated page load — that covers
 * sessions restored from a cookie, which never pass through a fresh sign-in.
 *
 * Every call is a no-op until the analytics SDK is initialised, and init is
 * itself gated on analytics consent, so this writes nothing for a visitor who
 * chose "Essential only".
 */
export function AnalyticsIdentity(identity: Identity) {
  const { userId, email, name, plan, signupDate } = identity;

  useEffect(() => {
    if (!userId) return;
    identifyUser({ userId, email, name, plan, signupDate });
  }, [userId, email, name, plan, signupDate]);

  return null;
}
