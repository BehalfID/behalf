import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../../guard";

export const metadata: Metadata = {
  title: "Webhook — BehalfID",
  description: "Webhook endpoint detail."
};

export default async function Page({ params }: { params: Promise<{ webhookId: string }> }) {
  const { webhookId } = await params;
  return <WorkspaceProtectedDashboard view="webhook" id={webhookId} />;
}
