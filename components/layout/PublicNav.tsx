import { PublicNavClient } from "@/components/layout/PublicNavClient";
import { getPublicAuthAction } from "@/lib/publicAuthAction";

export async function PublicNav() {
  const authAction = await getPublicAuthAction();

  return <PublicNavClient authAction={authAction} />;
}
