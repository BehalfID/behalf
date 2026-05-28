import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Agents — BehalfID",
  description: "Manage the AI agents BehalfID enforces permissions for.",
};

export default function AgentsPage() {
  return <ProtectedDashboard view="agents" />;
}
