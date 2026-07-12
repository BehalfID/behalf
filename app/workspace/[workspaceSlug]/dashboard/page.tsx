import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "./guard";

export const metadata: Metadata = {
  title: "Dashboard — BehalfID",
  description: "Overview of your agents, usage, and verification activity."
};

export default function WorkspaceDashboardPage() {
  return <WorkspaceProtectedDashboard view="home" />;
}
