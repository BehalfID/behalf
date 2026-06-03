import type { Metadata } from "next";
import { VerifyEmailClient } from "./client";

export const metadata: Metadata = {
  title: "Verify email — BehalfID",
  description: "Verify your email address to activate your BehalfID developer account.",
  alternates: { canonical: "/verify-email" }
};

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailClient token={token} />;
}
