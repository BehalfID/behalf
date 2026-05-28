import type { Metadata } from "next";
import { ConsolePage } from "../client";
import { requireConsolePage } from "@/lib/console";

export const metadata: Metadata = {
  title: "Status Page — BehalfID Console",
  description: "Manage public status page components and incidents.",
};

export default async function Page() {
  await requireConsolePage();
  return <ConsolePage view="status" />;
}
