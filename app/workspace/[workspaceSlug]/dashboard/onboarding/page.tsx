import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

/** Workspace-scoped alias of the retired second setup wizard. */
export default async function Page({ params }: PageProps) {
  const { workspaceSlug } = await params;
  redirect(`/workspace/${encodeURIComponent(workspaceSlug)}/dashboard/agents/new`);
}
