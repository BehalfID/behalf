import type { Metadata } from "next";
import styles from "./home-v2.module.css";
import { MarketingNavbar } from "@/components/marketing-v2/MarketingNavbar";
import { HeroAuthorizationDemo } from "@/components/marketing-v2/HeroAuthorizationDemo";
import { TrustStrip } from "@/components/marketing-v2/TrustStrip";
import { ProblemSection } from "@/components/marketing-v2/ProblemSection";
import { HowItWorks } from "@/components/marketing-v2/HowItWorks";
import { PermissionPolicyDemo } from "@/components/marketing-v2/PermissionPolicyDemo";
import { ApprovalWorkflowDemo } from "@/components/marketing-v2/ApprovalWorkflowDemo";
import { VerificationLogDemo } from "@/components/marketing-v2/VerificationLogDemo";
import { ManagedProfileDemo } from "@/components/marketing-v2/ManagedProfileDemo";
import { DeveloperIntegration } from "@/components/marketing-v2/DeveloperIntegration";
import { EnterpriseGovernance } from "@/components/marketing-v2/EnterpriseGovernance";
import { SecurityPrinciples } from "@/components/marketing-v2/SecurityPrinciples";
import { AuthorizationComparison } from "@/components/marketing-v2/AuthorizationComparison";
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
    <div className={styles.root}>
      <a href="#v2-main" className={styles.skipLink}>
        Skip to main content
      </a>
      <p className={styles.previewBanner}>
        Preview — redesign draft at /home-v2. The production homepage is unchanged.
      </p>
      <MarketingNavbar />
      <main id="v2-main">
        <HeroAuthorizationDemo />
        <TrustStrip />
        <ProblemSection />
        <HowItWorks />
        <PermissionPolicyDemo />
        <ApprovalWorkflowDemo />
        <VerificationLogDemo />
        <ManagedProfileDemo />
        <DeveloperIntegration />
        <EnterpriseGovernance />
        <SecurityPrinciples />
        <AuthorizationComparison />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </div>
  );
}
