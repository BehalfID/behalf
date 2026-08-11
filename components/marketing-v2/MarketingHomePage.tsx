import type { Metadata } from "next";
import { MarketingLayout } from "@/components/design-system/MarketingLayout";
import { LovableHomeContent } from "@/components/marketing/LovableHomeContent";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";
import { getSdkDownloads } from "@/lib/npmDownloads";

const description =
  "Approval gates and runtime authorization for AI coding agents. Decide what agents such as Claude Code, Codex and Cursor may do, what is denied, and what requires human approval — decided before integrated actions run.";

const title = "BehalfID — Approval gates for coding agents";

export const homepageMetadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    url: "https://behalfid.com",
    siteName: "BehalfID",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title,
    description
  }
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://behalfid.com/#organization",
      name: "BehalfID",
      url: "https://behalfid.com",
      description
    },
    {
      "@type": "WebSite",
      "@id": "https://behalfid.com/#website",
      name: "BehalfID",
      url: "https://behalfid.com",
      description,
      publisher: { "@id": "https://behalfid.com/#organization" },
      datePublished: "2026-05-03",
      dateModified: "2026-08-09"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://behalfid.com/#software",
      name: "BehalfID",
      url: "https://behalfid.com",
      description,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      publisher: { "@id": "https://behalfid.com/#organization" },
      offers: [
        {
          "@type": "Offer",
          name: "Free plan",
          price: "0",
          priceCurrency: "USD",
          url: "https://behalfid.com/pricing"
        },
        {
          "@type": "Offer",
          name: "Pro plan ($20/month)",
          price: "20",
          priceCurrency: "USD",
          url: "https://behalfid.com/pricing"
        }
      ]
    }
  ]
};

export async function MarketingHomePage() {
  const [authAction, downloads] = await Promise.all([getPublicAuthAction(), getSdkDownloads()]);
  let googleEnabled = false;
  try {
    googleEnabled = isGoogleOAuthConfigured();
  } catch {
    googleEnabled = false;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingLayout authAction={authAction} googleEnabled={googleEnabled}>
        <LovableHomeContent downloads={downloads} />
      </MarketingLayout>
    </>
  );
}
