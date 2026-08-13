import { redirect } from "next/navigation";

/**
 * `/dashboard/onboarding` used to host a second, older agent-creation wizard
 * with its own permission model. There is now one setup flow, so this route
 * exists only to keep old links and bookmarks working.
 */
export default function OnboardingPage() {
  redirect("/dashboard/agents/new");
}
