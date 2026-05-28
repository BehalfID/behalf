import type { Metadata } from "next";
import { ProtectedDashboard } from "../guard";

export const metadata: Metadata = {
  title: "Add agent — BehalfID",
  description: "Create a new agent with credentials, permissions, and enforcement mode.",
};

export default function OnboardingPage() {
  return <ProtectedDashboard view="onboarding" />;
}
