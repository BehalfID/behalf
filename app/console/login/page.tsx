import { redirectAuthenticatedConsole } from "@/lib/console";
import { LoginPage } from "../client";

export default async function Page() {
  await redirectAuthenticatedConsole();
  return <LoginPage />;
}
