import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Site Guard — BehalfID",
  description: "Manage sites and rules to control AI agent access to your web routes.",
};

export default function DashboardSitesPage() {
  return <ProtectedDashboard view="sites" />;
}
