import type { Metadata } from "next";
import { redirectAuthenticatedConsole } from "@/lib/console";
import { LoginPage } from "../client";

export const metadata: Metadata = {
  title: "Console login — BehalfID",
  description: "Internal administration login for BehalfID.",
};

export default async function Page() {
  await redirectAuthenticatedConsole();
  return <LoginPage />;
}
