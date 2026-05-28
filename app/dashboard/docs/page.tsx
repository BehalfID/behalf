import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Quick start — BehalfID",
  description: "Step-by-step integration guide for agents, permissions, and the SDK.",
};

export default function DashboardDocsPage() {
  return <ProtectedDashboard view="docs" />;
}
