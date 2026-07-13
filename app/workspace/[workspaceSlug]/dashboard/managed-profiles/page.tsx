import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Managed profiles — BehalfID",
  description: "CLI managed permission profiles."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="managed-profiles" />;
}
