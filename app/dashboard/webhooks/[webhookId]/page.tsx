import { ProtectedDashboard } from "../../guard";

type PageProps = { params: Promise<{ webhookId: string }> };

export default async function WebhookPage({ params }: PageProps) {
  const { webhookId } = await params;
  return <ProtectedDashboard view="webhook" id={webhookId} />;
}
