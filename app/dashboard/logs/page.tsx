import { ProtectedDashboard } from "../guard";

export default function LogsPage() {
  return <ProtectedDashboard view="logs" />;
}
