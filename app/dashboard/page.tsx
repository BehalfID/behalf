import { ProtectedDashboard } from "./guard";

export default function DashboardPage() {
  return <ProtectedDashboard view="home" />;
}
