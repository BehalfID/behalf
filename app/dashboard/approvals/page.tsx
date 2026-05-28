import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Approvals — BehalfID",
  description: "Review and resolve pending agent action approval requests.",
};

export default function ApprovalsPage() {
  return <ProtectedDashboard view="approvals" />;
}
