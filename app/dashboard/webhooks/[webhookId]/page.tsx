import type { Metadata } from "next";
import { ProtectedDashboard } from "../../guard";

export const metadata: Metadata = {
  title: "Webhook — BehalfID",
  description: "View webhook endpoint details, subscribed events, and delivery history.",
};

type PageProps = { params: Promise<{ webhookId: string }> };

export default async function WebhookPage({ params }: PageProps) {
  const { webhookId } = await params;
  return <ProtectedDashboard view="webhook" id={webhookId} />;
}
