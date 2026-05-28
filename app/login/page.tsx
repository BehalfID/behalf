import type { Metadata } from "next";
import { AuthPage } from "../auth-client";

export const metadata: Metadata = {
  title: "Log in — BehalfID",
  description: "Sign in to manage your AI agents, permissions, audit logs, and webhook delivery.",
  alternates: { canonical: "/login" }
};

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
