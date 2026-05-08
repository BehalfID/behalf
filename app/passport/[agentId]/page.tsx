import { PassportClient } from "./passport-client";

type PassportPageProps = {
  params: Promise<{ agentId: string }>;
};

export default async function PassportPage({ params }: PassportPageProps) {
  const { agentId } = await params;
  return <PassportClient agentId={agentId} token="" />;
}
