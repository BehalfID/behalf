import type { Metadata } from "next";
import { WorkspaceProtectedDashboard } from "../../guard";

export const metadata: Metadata = {
  title: "Agent — BehalfID",
  description: "Agent detail and permissions."
};

export default async function Page({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <WorkspaceProtectedDashboard view="agent" id={agentId} agentSection="overview" />;
}
