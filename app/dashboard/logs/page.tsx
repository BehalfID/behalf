import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Logs — BehalfID",
  description: "Verification logs and audit trail for agent actions.",
};

export default function LogsPage() {
  return <ProtectedDashboard view="logs" />;
}
