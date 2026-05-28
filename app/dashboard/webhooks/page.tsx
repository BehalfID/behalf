import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Webhooks — BehalfID",
  description: "Configure webhook endpoints to receive signed verification events.",
};

export default function WebhooksPage() {
  return <ProtectedDashboard view="webhooks" />;
}
