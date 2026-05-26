import { ProtectedDashboard } from "../guard";

export default function ApprovalsPage() {
  return <ProtectedDashboard view="approvals" />;
}
