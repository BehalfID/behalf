import type { Metadata } from "next";
import { ProtectedDashboard } from "../../guard";

export const metadata: Metadata = {
  title: "Agent — BehalfID",
  description: "View and manage this agent's credentials, permissions, and verification logs.",
};

type PageProps = { params: Promise<{ agentId: string }> };

export default async function AgentPage({ params }: PageProps) {
  const { agentId } = await params;
  return <ProtectedDashboard view="agent" id={agentId} />;
}
