import { ConsolePage } from "../client";
import { requireConsolePage } from "@/lib/console";

export default async function ConsoleSiteGuardPage() {
  await requireConsolePage();
  return <ConsolePage view="site-guard" />;
}
