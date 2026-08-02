import type { Metadata } from "next";
import { AdaptiveEnginePage } from "@/components/marketing/AdaptiveEnginePage";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";

export const metadata: Metadata = {
  title: "Adaptive engine — how BehalfID learns from human decisions",
  description:
    "Observe, recommend, enforce: how BehalfID turns repeated human approval decisions into bounded, administrator-enabled rules while explicit policy stays authoritative.",
  alternates: { canonical: "/adaptive-engine" },
  openGraph: {
    title: "Adaptive engine — how BehalfID learns from human decisions",
    description:
      "Observe, recommend, enforce: how BehalfID turns repeated human approval decisions into bounded, administrator-enabled rules while explicit policy stays authoritative.",
    url: "https://behalfid.com/adaptive-engine",
    siteName: "BehalfID",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Adaptive engine — BehalfID",
    description:
      "Observe, recommend, enforce — with explicit policy authoritative and administrator control before enforcement."
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
  return <AdaptiveEnginePage authAction={authAction} googleEnabled={googleEnabled} />;
}
