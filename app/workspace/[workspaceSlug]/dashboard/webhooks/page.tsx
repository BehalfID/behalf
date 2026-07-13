import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Webhooks — BehalfID",
  description: "Manage event delivery endpoints."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="webhooks" />;
}
