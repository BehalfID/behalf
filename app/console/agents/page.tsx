import { ConsolePage } from "../client";
import { requireConsolePage } from "@/lib/console";

export default async function Page() {
  await requireConsolePage();
  return <ConsolePage view="agents" />;
}
