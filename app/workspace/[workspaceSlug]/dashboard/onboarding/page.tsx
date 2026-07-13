import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Add agent — BehalfID",
  description: "Create and configure a new agent."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="onboarding" />;
}
