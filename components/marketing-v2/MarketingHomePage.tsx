import type { Metadata } from "next";
import styles from "@/app/home-v2/home-v2.module.css";
import { EnterpriseGovernance } from "./EnterpriseGovernance";
import { FinalCTA } from "./FinalCTA";
import { HeroAuthorizationDemo } from "./HeroAuthorizationDemo";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingNavbar } from "./MarketingNavbar";
import { ProblemSection } from "./ProblemSection";
import { ProductShowcase } from "./ProductShowcase";
import { TrustStrip } from "./TrustStrip";

const description =
  "Give every AI agent a distinct identity, scoped permissions, human approval gates, and an auditable record of every attempted action.";

export const homepageMetadata: Metadata = {
  title: "BehalfID — Authorization control for AI agents",
  description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "BehalfID — Authorization control for AI agents",
    description,
    url: "https://behalfid.com",
    siteName: "BehalfID",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "BehalfID — Authorization control for AI agents",
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
      dateModified: "2026-07-16"
    }
  ]
};

export function MarketingHomePage() {
  return (
    <div className={styles.root}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />
      <main id="main-content" tabIndex={-1}>
        <HeroAuthorizationDemo />
        <TrustStrip />
        <ProblemSection />
        <ProductShowcase />
        <EnterpriseGovernance />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </div>
  );
}
