import type { Metadata } from "next";
import { ProtectedDashboard } from "./guard";

export const metadata: Metadata = {
  title: "Dashboard — BehalfID",
  description: "Overview of your agents, usage, and verification activity.",
};

export default function DashboardPage() {
  return <ProtectedDashboard view="home" />;
}
