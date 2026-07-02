import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { AuthPage } from "../auth-client";

export const metadata: Metadata = {
  title: "Sign up — BehalfID",
  description: "Create a developer workspace to manage AI agent identities, scoped permissions, audit logs, and signed webhook events.",
  alternates: { canonical: "/signup" }
};

export default async function SignupPage() {
  const user = await getCurrentDeveloper();
  if (user) {
    if (await shouldForceAccountSetup(user.userId)) redirect("/onboarding");
    redirect("/dashboard");
  }
  return <AuthPage mode="signup" />;
}
