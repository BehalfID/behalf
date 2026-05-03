import { ProtectedDashboard } from "../guard";

export default function WebhooksPage() {
  return <ProtectedDashboard view="webhooks" />;
}
