import type { Metadata } from "next";
import { AgentDetailPage } from "../../client";
import { requireConsolePage } from "@/lib/console";

export const metadata: Metadata = {
  title: "Agent — BehalfID Console",
  description: "View and manage agent credentials, permissions, and logs.",
};

type PageProps = {
  params: Promise<{ agentId: string }>;
};

export default async function Page({ params }: PageProps) {
  await requireConsolePage();
  const { agentId } = await params;
  return <AgentDetailPage agentId={agentId} />;
}
