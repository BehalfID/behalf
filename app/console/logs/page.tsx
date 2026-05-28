import type { Metadata } from "next";
import { ConsolePage } from "../client";
import { requireConsolePage } from "@/lib/console";

export const metadata: Metadata = {
  title: "Logs — BehalfID Console",
  description: "View all verification logs across all agents and accounts.",
};

export default async function Page() {
  await requireConsolePage();
  return <ConsolePage view="logs" />;
}
