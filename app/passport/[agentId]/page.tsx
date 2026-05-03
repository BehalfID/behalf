import { PassportClient } from "./passport-client";

type PassportPageProps = {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PassportPage({ params, searchParams }: PassportPageProps) {
  const { agentId } = await params;
  const { token = "" } = await searchParams;
  return <PassportClient agentId={agentId} token={token} />;
}
