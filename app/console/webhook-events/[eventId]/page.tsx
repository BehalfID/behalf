import type { Metadata } from "next";
import { WebhookEventDetailPage } from "../../client";

export const metadata: Metadata = {
  title: "Webhook event — BehalfID Console",
  description: "Inspect webhook event payload and delivery attempts.",
};

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function WebhookEventPage({ params }: PageProps) {
  const { eventId } = await params;
  return <WebhookEventDetailPage eventId={eventId} />;
}
