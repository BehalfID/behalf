import { requireConsolePage } from "@/lib/console";
import { WebhookDetailPage } from "../../client";

type PageProps = {
  params: Promise<{ webhookId: string }>;
};

export default async function Page({ params }: PageProps) {
  await requireConsolePage();
  const { webhookId } = await params;
  return <WebhookDetailPage webhookId={webhookId} />;
}
