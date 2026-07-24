import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { requiresEmailVerificationRedirect } from "@/lib/emailVerificationGuard";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { resolveOwnedHref } from "@/lib/subdomainRouting";
import { AuthPage } from "../auth-client";

export const metadata: Metadata = {
  title: "Sign up — BehalfID",
  description: "Create a developer workspace to manage AI agent identities, scoped permissions, audit logs, and signed webhook events.",
  alternates: { canonical: "/signup" }
};

function safeNextPath(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  const nextPath = safeNextPath(next) ?? undefined;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const user = await getCurrentDeveloper();
  if (user) {
    if (requiresEmailVerificationRedirect(user)) {
      redirect(resolveOwnedHref("/verify-email", { hostname: host }));
    }
    if (await shouldForceAccountSetup(user.userId)) {
      redirect(resolveOwnedHref("/onboarding", { hostname: host }));
    }
    redirect(resolveOwnedHref(nextPath ?? "/dashboard", { hostname: host }));
  }
  return (
    <Suspense fallback={<main className="auth-page"><p>Loading…</p></main>}>
      <AuthPage
        mode="signup"
        nextPath={nextPath}
        initialEmail={email ?? ""}
        googleEnabled={isGoogleOAuthConfigured()}
      />
    </Suspense>
  );
}
