import { cache } from "react";
import { getCurrentDeveloper } from "@/lib/developerAuth";

/**
 * The legacy dashboard entry is intentionally the public auth destination.
 * Its existing guard owns onboarding and active/primary workspace resolution.
 */
export const PUBLIC_DASHBOARD_ENTRY_HREF = "/dashboard";

export type PublicAuthAction = Readonly<{
  href: string;
  label: string;
  isAuthenticated: boolean;
}>;

export function createPublicAuthAction(
  isAuthenticated: boolean,
  unauthenticatedLabel = "Sign in"
): PublicAuthAction {
  return isAuthenticated
    ? {
        href: PUBLIC_DASHBOARD_ENTRY_HREF,
        label: "To Dashboard",
        isAuthenticated: true
      }
    : {
        href: "/login",
        label: unauthenticatedLabel,
        isAuthenticated: false
      };
}

const hasCurrentDeveloper = cache(async () => Boolean(await getCurrentDeveloper()));

/** Resolve only the public action state; no user or workspace data crosses into the client. */
export async function getPublicAuthAction(
  unauthenticatedLabel = "Sign in"
): Promise<PublicAuthAction> {
  return createPublicAuthAction(await hasCurrentDeveloper(), unauthenticatedLabel);
}
