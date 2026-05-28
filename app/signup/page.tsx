import type { Metadata } from "next";
import { AuthPage } from "../auth-client";

export const metadata: Metadata = {
  title: "Sign up — BehalfID",
  description: "Create a developer workspace to manage AI agent identities, scoped permissions, audit logs, and signed webhook events.",
  alternates: { canonical: "/signup" }
};

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
