import type { Metadata } from "next";
import { MarketingLayout } from "@/components/design-system/MarketingLayout";
import { LovableHomeContent } from "@/components/marketing/LovableHomeContent";
import { getPublicAuthAction } from "@/lib/publicAuthAction";

/**
 * Production homepage shell.
 *
 * Renders the Lovable homepage component tree (`LovableHomeContent`) under the
 * Lovable-derived MarketingLayout. This is a direct port of
 * agent-gatekeeper-suite `src/routes/index.tsx` — not a restyle of the legacy
 * split-hero / verification-table marketing homepage.
 */
const description =
  "BehalfID gives every AI agent an identity, clear permissions and approval rules — and learns from human approval decisions so control gets more precise over time.";

export const homepageMetadata: Metadata = {
  title: "BehalfID — Give AI agents freedom, keep their authority controlled",
  description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "BehalfID — Give AI agents freedom, keep their authority controlled",
    description,
    url: "https://behalfid.com",
    siteName: "BehalfID",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "BehalfID — Give AI agents freedom, keep their authority controlled",
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
      dateModified: "2026-08-02"
    }
  ]
};

export async function MarketingHomePage() {
  const authAction = await getPublicAuthAction();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingLayout authAction={authAction}>
        <LovableHomeContent />
      </MarketingLayout>
    </>
  );
}
