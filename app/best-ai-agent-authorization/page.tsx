import { ComparisonPage, comparisonMetadata } from "@/components/marketing/ComparisonPage";
import { requireComparison } from "@/components/marketing/comparisons";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

const data = requireComparison("best-ai-agent-authorization");

export const metadata = comparisonMetadata(data);

export default async function Page() {
  const authAction = await getPublicAuthAction();
  let googleEnabled = false;
  try {
    googleEnabled = isGoogleOAuthConfigured();
  } catch {
    googleEnabled = false;
  }
  return <ComparisonPage data={data} authAction={authAction} googleEnabled={googleEnabled} />;
}
