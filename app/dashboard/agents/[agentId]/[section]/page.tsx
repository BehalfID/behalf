import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAgentDetailSection } from "@/components/dashboard/agent-detail/types";
import { ProtectedDashboard } from "../../../guard";

export const metadata: Metadata = {
  title: "Agent — BehalfID",
  description: "Agent identity, permissions, integrations, and activity."
};

export default async function LegacyAgentSectionPage({
  params
}: {
  params: Promise<{ agentId: string; section: string }>;
}) {
  const { agentId, section } = await params;
  if (!isAgentDetailSection(section) || section === "overview") notFound();
  return <ProtectedDashboard view="agent" id={agentId} agentSection={section} />;
}
