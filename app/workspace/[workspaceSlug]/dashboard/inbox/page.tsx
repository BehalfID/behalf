import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Needs attention — BehalfID",
  description: "Approvals and high-risk denials that need review."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="inbox" />;
}
