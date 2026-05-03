import { ProtectedDashboard } from "../../guard";

type PageProps = { params: Promise<{ agentId: string }> };

export default async function AgentPage({ params }: PageProps) {
  const { agentId } = await params;
  return <ProtectedDashboard view="agent" id={agentId} />;
}
