import type { Metadata } from "next";
import { DocsShell } from "../content";
import { QuickstartDocsBody } from "../_shared/quickstartBody";

export const metadata: Metadata = {
  title: "SDK Quickstart — BehalfID",
  description: "Create an agent, add one permission, call verify() before execution, and prove both allowed and denied actions in about five minutes.",
  alternates: { canonical: "/docs/quickstart" }
};

export default function QuickstartPage() {
  return (
    <DocsShell
      title="SDK Quickstart"
      description="Create an agent, add one permission, call verify() before execution, and prove both allowed and denied actions in about five minutes."
      previous={{ href: "/docs/cli", label: "Coding agent quickstart (CLI/MCP)" }}
      next={{ href: "/docs/deploy-approvals", label: "Deploy approvals" }}
    >
      <QuickstartDocsBody />
    </DocsShell>
  );
}
