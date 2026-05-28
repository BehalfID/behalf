import type { Metadata } from "next";
import { ConsolePage } from "../client";
import { requireConsolePage } from "@/lib/console";

export const metadata: Metadata = {
  title: "Agents — BehalfID Console",
  description: "Inspect and manage all agents across the BehalfID platform.",
};

export default async function Page() {
  await requireConsolePage();
  return <ConsolePage view="agents" />;
}
