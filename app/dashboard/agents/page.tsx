import { ProtectedDashboard } from "../guard";

export default function AgentsPage() {
  return <ProtectedDashboard view="agents" />;
}
