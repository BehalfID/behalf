import { DocsLayoutClient, docsNav } from "@/components/layout/DocsLayoutClient";
import { getPublicAuthAction } from "@/lib/publicAuthAction";

export { docsNav };

export async function DocsLayout({ children }: { children: React.ReactNode }) {
  const authAction = await getPublicAuthAction();

  return <DocsLayoutClient authAction={authAction}>{children}</DocsLayoutClient>;
}
