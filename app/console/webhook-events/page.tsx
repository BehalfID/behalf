import type { Metadata } from "next";
import { ConsolePage } from "../client";

export const metadata: Metadata = {
  title: "Webhook Events — BehalfID Console",
  description: "Inspect and replay webhook event delivery queue.",
};

export default function WebhookEventsPage() {
  return <ConsolePage view="webhook-events" />;
}
