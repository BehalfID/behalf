import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Audit logs — BehalfID",
  description: "Verification and enforcement audit history."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="logs" />;
}
