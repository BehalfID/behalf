import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Approvals — BehalfID",
  description: "Review and resolve pending approval requests."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="approvals" />;
}
