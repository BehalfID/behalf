"use client";

import { useEffect, useRef } from "react";
import { trackDashboardReached } from "@/lib/analytics/funnel";

/**
 * Reports that a dashboard actually rendered for a signed-in user.
 *
 * This exists because "did login land the user somewhere real?" is not a
 * question the URL can answer. `/dashboard` is a redirect stub: the guard
 * resolves the caller's workspace and forwards to `/<workspaceSlug>/dashboard`,
 * so the path a real user ends on contains a slug that differs per workspace.
 * A funnel step keyed on `/dashboard` therefore matches nobody — every signed-in
 * session appears to stop at login even when the product is working.
 *
 * Mounting is the signal. It fires after the guard chain (session, email
 * verification, forced account setup, workspace resolution) has already let the
 * request through, so an event here means a dashboard was really reached, and
 * its absence means the handoff stopped somewhere upstream.
 *
 * `workspaceResolved` distinguishes the healthy path from the degraded one: the
 * legacy shell renders without a slug when a workspace cannot be resolved, which
 * looks fine to the user but is worth being able to count separately.
 */
export function DashboardReachedBeacon({
  view,
  workspaceResolved
}: {
  view: string;
  workspaceResolved: boolean;
}) {
  // Once per mounted view. The parent remounts on workspace/view change via its
  // key, so navigating between dashboard pages reports each one exactly once.
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    trackDashboardReached(view, workspaceResolved);
  }, [view, workspaceResolved]);

  return null;
}
