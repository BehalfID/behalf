import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Docs — BehalfID",
  description: "Dashboard documentation."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="docs" />;
}
