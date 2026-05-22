import { ProtectedDashboard } from "../guard";

export default function DashboardSitesPage() {
  return <ProtectedDashboard view="sites" />;
}
