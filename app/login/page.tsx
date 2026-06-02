import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { AuthPage } from "../auth-client";

export const metadata: Metadata = {
  title: "Log in — BehalfID",
  description: "Sign in to manage your AI agents, permissions, audit logs, and webhook delivery.",
  alternates: { canonical: "/login" }
};

export default async function LoginPage() {
  const user = await getCurrentDeveloper();
  if (user) redirect("/dashboard");
  return <AuthPage mode="login" />;
}
