import type { Metadata } from "next";
import { InviteClient } from "./client";

export const metadata: Metadata = {
  title: "Accept invite — BehalfID", // pragma: allowlist secret
  description: "Accept a workspace invite to join a shared BehalfID account.", // pragma: allowlist secret
  alternates: { canonical: "/invite" }
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteClient token={token} />;
}
