import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Adaptive Delegation — BehalfID",
  description: "Review deterministic permission recommendations from approval history."
};

export default function Page() {
  return <ProtectedDashboard view="adaptive-delegation" />;
}
