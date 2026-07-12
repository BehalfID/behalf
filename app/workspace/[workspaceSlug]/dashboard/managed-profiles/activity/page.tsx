import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../../guard";

export const metadata: Metadata = {
  title: "Managed profile activity — BehalfID",
  description: "Managed profile activity log."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="managed-profiles-activity" />;
}
