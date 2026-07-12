import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Agents — BehalfID",
  description: "Manage the AI agents BehalfID enforces permissions for."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="agents" />;
}
