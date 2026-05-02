import { requireConsolePage } from "@/lib/console";
import { ConsolePage } from "../client";

export default async function Page() {
  await requireConsolePage();
  return <ConsolePage view="webhooks" />;
}
