import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "MCP ecosystem — BehalfID",
  description: "Audit MCP configs, wrap servers for hard enforcement, and remediate findings.",
};

export default function Page() {
  return <WorkspaceProtectedDashboard view="mcp" />;
}
