import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { isGitHubOAuthConfigured } from "@/lib/authProviders/providers/github";
import { isWebAuthnConfigured } from "@/lib/authProviders/webauthnConfig";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { AuthPage } from "../auth-client";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.loginMeta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/login" }
  };
}

/** Same sanitisation as the root auth route: relative, single-slash paths only. */
function safeNextPath(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export default async function LoginPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  const nextPath = safeNextPath(next) ?? undefined;
  setRequestLocale(locale);
  const user = await getCurrentDeveloper();
  if (user) {
    if (await shouldForceAccountSetup(user.userId)) redirect("/onboarding");
    redirect("/dashboard");
  }
  return (
    <AuthPage
      mode="login"
      nextPath={nextPath}
      googleEnabled={isGoogleOAuthConfigured()}
      githubEnabled={isGitHubOAuthConfigured()}
      passkeyEnabled={isWebAuthnConfigured()}
    />
  );
}
