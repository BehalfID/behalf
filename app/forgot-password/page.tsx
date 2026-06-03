import type { Metadata } from "next";
import { ForgotPasswordClient } from "./client";

export const metadata: Metadata = {
  title: "Reset password — BehalfID",
  description: "Request a password reset link for your BehalfID developer account.",
  alternates: { canonical: "/forgot-password" }
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
