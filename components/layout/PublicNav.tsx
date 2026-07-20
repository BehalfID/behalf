import { PublicNavClient } from "@/components/layout/PublicNavClient";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

export async function PublicNav() {
  const authAction = await getPublicAuthAction();
  const googleEnabled = isGoogleOAuthConfigured();

  return <PublicNavClient authAction={authAction} googleEnabled={googleEnabled} />;
}
