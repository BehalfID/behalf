"use client";

import { MarketingHeader } from "@/components/design-system/MarketingHeader";
import type { PublicAuthAction as PublicAuthActionValue } from "@/lib/publicAuthAction";

/** Phase 2 cutover: public chrome uses the Lovable-derived marketing header. */
export function PublicNavClient({
  authAction,
  googleEnabled = false
}: {
  authAction: PublicAuthActionValue;
  googleEnabled?: boolean;
}) {
  return <MarketingHeader authAction={authAction} googleEnabled={googleEnabled} />;
}
