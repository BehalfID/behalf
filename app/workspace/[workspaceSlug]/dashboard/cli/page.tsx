import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "CLI — BehalfID",
  description: "Run BehalfID CLI commands from the browser terminal."
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="cli" />;
}
