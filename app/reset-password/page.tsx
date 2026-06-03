import type { Metadata } from "next";
import { ResetPasswordClient } from "./client";

export const metadata: Metadata = {
  title: "Set new password — BehalfID",
  description: "Set a new password for your BehalfID developer account.",
  alternates: { canonical: "/reset-password" }
};

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordClient token={token} />;
}
