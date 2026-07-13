import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Sites — BehalfID",
  description: "Site Guard configuration."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="sites" />;
}
