import { AboutPage, aboutMetadata } from "@/components/marketing/AboutPage";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

export const metadata = aboutMetadata;

export default async function Page() {
  const authAction = await getPublicAuthAction();
  let googleEnabled = false;
  try {
    googleEnabled = isGoogleOAuthConfigured();
  } catch {
    googleEnabled = false;
  }
  return <AboutPage authAction={authAction} googleEnabled={googleEnabled} />;
}
