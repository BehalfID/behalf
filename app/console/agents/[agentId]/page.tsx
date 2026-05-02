import { AgentDetailPage } from "../../client";
import { requireConsolePage } from "@/lib/console";

type PageProps = {
  params: Promise<{ agentId: string }>;
};

export default async function Page({ params }: PageProps) {
  await requireConsolePage();
  const { agentId } = await params;
  return <AgentDetailPage agentId={agentId} />;
}
