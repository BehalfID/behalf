import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { requiresEmailVerificationRedirect } from "@/lib/emailVerificationGuard";
import { findByUserId } from "@/lib/repositories/users";
import { AccountSetupClient } from "./client";

export const metadata: Metadata = {
  title: "Account setup — BehalfID", // pragma: allowlist secret
};

export default async function OnboardingPage() {
  const user = await getCurrentDeveloper();
  if (!user) redirect("/login");
  if (requiresEmailVerificationRedirect(user)) redirect("/verify-email");

  const fullUser = await findByUserId(user.userId);
  if (fullUser?.onboardingCompletedAt) redirect("/dashboard");

  return <AccountSetupClient emailVerified={user.emailVerified !== false} />;
}
