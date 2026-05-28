import type { Metadata } from "next";
import { ConsolePage } from "./client";
import { requireConsolePage } from "@/lib/console";

export const metadata: Metadata = {
  title: "Console — BehalfID",
  description: "Internal administration dashboard for BehalfID.",
};

export default async function Page() {
  await requireConsolePage();
  return <ConsolePage view="dashboard" />;
}
