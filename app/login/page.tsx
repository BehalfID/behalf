import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { requiresEmailVerificationRedirect } from "@/lib/emailVerificationGuard";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { AuthPage } from "../auth-client";

export const metadata: Metadata = {
  title: "Log in — BehalfID",
  description: "Sign in to manage your AI agents, permissions, audit logs, and webhook delivery.",
  alternates: { canonical: "/login" }
};

function safeNextPath(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next) ?? undefined;
  const user = await getCurrentDeveloper();
  if (user) {
    if (requiresEmailVerificationRedirect(user)) redirect("/verify-email");
    if (await shouldForceAccountSetup(user.userId)) redirect("/onboarding");
    redirect(nextPath ?? "/dashboard");
  }
  return <AuthPage mode="login" nextPath={nextPath} />;
}
