import { MarketingNavbarClient } from "./MarketingNavbarClient";
import { getPublicAuthAction } from "@/lib/publicAuthAction";

export async function MarketingNavbar() {
  const authAction = await getPublicAuthAction();

  return <MarketingNavbarClient authAction={authAction} />;
}
