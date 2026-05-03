import { WebhookEventDetailPage } from "../../client";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function WebhookEventPage({ params }: PageProps) {
  const { eventId } = await params;
  return <WebhookEventDetailPage eventId={eventId} />;
}
