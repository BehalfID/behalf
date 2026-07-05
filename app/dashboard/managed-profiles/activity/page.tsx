import type { Metadata } from "next";
import { ProtectedDashboard } from "../../guard";

export const metadata: Metadata = {
  title: "Managed profile activity — BehalfID", // pragma: allowlist secret
  description: "See local coding-agent policy decisions and pause events for this workspace.",
};

export default function ManagedProfileActivityPage() {
  return <ProtectedDashboard view="managed-profiles-activity" />;
}
