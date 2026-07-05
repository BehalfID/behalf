import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Managed profiles — BehalfID", // pragma: allowlist secret
  description: "Configure when local coding agents run unmanaged, managed, or required.",
};

export default function ManagedProfilesPage() {
  return <ProtectedDashboard view="managed-profiles" />;
}
