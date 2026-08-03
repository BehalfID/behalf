import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "MCP ecosystem — BehalfID",
  description: "Audit MCP configs, wrap servers for hard enforcement, and remediate findings.",
};

export default function McpEcosystemPage() {
  return <ProtectedDashboard view="mcp" />;
}
