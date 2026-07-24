import type { Metadata } from "next";
import { DocsShell } from "../content";
import { TroubleshootingBody } from "../_shared/troubleshootingBody";

export const metadata: Metadata = {
  title: "Troubleshooting — BehalfID",
  description:
    "Diagnose verify failures, CLI doctor checks, auth errors, webhook delivery problems, and installer error codes with actionable fixes.",
  alternates: { canonical: "/docs/troubleshooting" }
};

export default function TroubleshootingPage() {
  return (
    <DocsShell
      title="Troubleshooting"
      description="Diagnose verify failures, CLI and install doctor output, auth errors, and webhook delivery problems — with the same reason strings and error codes the product returns."
      previous={{ href: "/docs/concepts", label: "Concepts" }}
      next={{ href: "/security", label: "Security" }}
    >
      <TroubleshootingBody />
    </DocsShell>
  );
}
