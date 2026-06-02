import type { Metadata } from "next";
import { ConsolePage } from "../client";
import { requireConsolePage } from "@/lib/console";

export const metadata: Metadata = {
  title: "Enterprise Inquiries — BehalfID Console",
};

export default async function Page() {
  await requireConsolePage();
  return <ConsolePage view="enterprise-inquiries" />;
}
