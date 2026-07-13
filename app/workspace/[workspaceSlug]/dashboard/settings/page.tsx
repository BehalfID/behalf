import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Settings — BehalfID",
  description: "Workspace settings, members, and API tokens."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="settings" />;
}
