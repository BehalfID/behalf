import type { Metadata } from "next";
import { ProtectedDashboard } from "../../guard";

export const metadata: Metadata = {
  title: "Set up your first agent — BehalfID", // pragma: allowlist secret
  description: "Guided setup to register a controlled coding agent, issue a token, and run your first verification."
};

export default function FirstAgentSetupPage() {
  return <ProtectedDashboard view="first-agent" />;
}
