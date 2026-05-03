import { ProtectedDashboard } from "../guard";

export default function DashboardDocsPage() {
  return <ProtectedDashboard view="docs" />;
}
