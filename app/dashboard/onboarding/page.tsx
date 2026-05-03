import { ProtectedDashboard } from "../guard";

export default function OnboardingPage() {
  return <ProtectedDashboard view="onboarding" />;
}
