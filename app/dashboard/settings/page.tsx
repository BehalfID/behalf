import { ProtectedDashboard } from "../guard";

export default function SettingsPage() {
  return <ProtectedDashboard view="settings" />;
}
