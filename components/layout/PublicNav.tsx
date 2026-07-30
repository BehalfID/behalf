import { PublicNavClient } from "@/components/layout/PublicNavClient";
import { createPublicAuthAction, getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

export async function PublicNav() {
  let authAction = createPublicAuthAction(false);
  let googleEnabled = false;
  try {
    authAction = await getPublicAuthAction();
    googleEnabled = isGoogleOAuthConfigured();
  } catch {
    // Public pages (especially /status) must render when session lookup fails.
  }

  return <PublicNavClient authAction={authAction} googleEnabled={googleEnabled} />;
}
