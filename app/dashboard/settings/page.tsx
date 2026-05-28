import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Settings — BehalfID",
  description: "Manage your account, developer tokens, and workspace preferences.",
};

export default function SettingsPage() {
  return <ProtectedDashboard view="settings" />;
}
