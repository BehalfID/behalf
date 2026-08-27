import type { Metadata } from "next";
import { redirectAuthenticatedConsole } from "@/lib/console";
import { LoginPage } from "../client";

export const metadata: Metadata = {
  title: "Console login — BehalfID",
  description: "Internal administration login for BehalfID.",
};

export default async function Page({ searchParams }: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  await redirectAuthenticatedConsole();
  const requested = (await searchParams).next;
  const nextPath =
    typeof requested === "string" && requested.startsWith("/console/orchestra/authorize?")
      ? requested
      : "/console";
  return <LoginPage nextPath={nextPath} />;
}
