import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { AuthenticateClient } from "./authenticate-client";

export const metadata = { title: "Authorize CLI — BehalfID" };

export default async function AuthenticatePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const user = await getCurrentDeveloper();
  if (!user) redirect("/login?next=/authenticate");

  const { code } = await searchParams;

  return <AuthenticateClient prefillCode={code} email={user.email} />;
}
