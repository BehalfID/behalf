import type { Metadata } from "next";
import { ContactPage } from "@/components/marketing/ContactPage";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

export const metadata: Metadata = {
  title: "Contact — BehalfID",
  description: "Talk to the BehalfID team about enterprise rollout, security review, or support.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact — BehalfID",
    description: "Talk to the BehalfID team about enterprise rollout, security review, or support.",
    url: "https://behalfid.com/contact",
    siteName: "BehalfID",
    type: "website"
  }
};

export default async function Page() {
  const authAction = await getPublicAuthAction();
  let googleEnabled = false;
  try {
    googleEnabled = isGoogleOAuthConfigured();
  } catch {
    googleEnabled = false;
  }
  return <ContactPage authAction={authAction} googleEnabled={googleEnabled} />;
}
