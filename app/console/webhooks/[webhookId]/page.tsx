import type { Metadata } from "next";
import { requireConsolePage } from "@/lib/console";
import { WebhookDetailPage } from "../../client";

export const metadata: Metadata = {
  title: "Webhook — BehalfID Console",
  description: "View webhook endpoint details and delivery attempts.",
};

type PageProps = {
  params: Promise<{ webhookId: string }>;
};

export default async function Page({ params }: PageProps) {
  await requireConsolePage();
  const { webhookId } = await params;
  return <WebhookDetailPage webhookId={webhookId} />;
}
