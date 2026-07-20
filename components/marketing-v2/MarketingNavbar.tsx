import { MarketingNavbarClient } from "./MarketingNavbarClient";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

export async function MarketingNavbar(props?: { googleEnabled?: boolean }) {
  const authAction = await getPublicAuthAction();
  const showGoogle = props?.googleEnabled ?? isGoogleOAuthConfigured();

  return <MarketingNavbarClient authAction={authAction} googleEnabled={showGoogle} />;
}
