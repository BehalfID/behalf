import type { Metadata } from "next";
import styles from "./home-v2.module.css";
import { MarketingNavbar } from "@/components/marketing-v2/MarketingNavbar";
import { HeroAuthorizationDemo } from "@/components/marketing-v2/HeroAuthorizationDemo";
import { TrustStrip } from "@/components/marketing-v2/TrustStrip";
import { ProblemSection } from "@/components/marketing-v2/ProblemSection";
import { ProductShowcase } from "@/components/marketing-v2/ProductShowcase";
import { EnterpriseGovernance } from "@/components/marketing-v2/EnterpriseGovernance";
import { FinalCTA } from "@/components/marketing-v2/FinalCTA";
import { MarketingFooter } from "@/components/marketing-v2/MarketingFooter";

export const metadata: Metadata = {
  title: "BehalfID — Authorization control for AI agents (preview)",
  description:
    "Isolated marketing redesign preview. BehalfID gives every AI agent a distinct identity, scoped permissions, human approval gates, and an auditable record of every attempted action.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/home-v2" }
};

export default function HomeV2Page() {
  return (
    <div className={`${styles.root} ui-theme-light`}>
      <p className={styles.previewBanner}>
        Preview: /home-v2. Production is unchanged.
      </p>
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
