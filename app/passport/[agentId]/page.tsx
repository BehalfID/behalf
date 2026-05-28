import type { Metadata } from "next";
import { PassportClient } from "./passport-client";

export const metadata: Metadata = {
  title: "Permission passport — BehalfID",
  description: "View this agent's allowed scopes, permission boundaries, and manual verification preview.",
};

type PassportPageProps = {
  params: Promise<{ agentId: string }>;
};

export default async function PassportPage({ params }: PassportPageProps) {
  const { agentId } = await params;
  return <PassportClient agentId={agentId} token="" />;
}
