import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { SandboxClient } from "./sandbox-client";

export const metadata = {
  title: "Decision Lab — BehalfID",
  description: "See how BehalfID stops unsafe AI actions before tools run. Choose an action, run it through a permission passport, and see the decision."
};

export default function SandboxPage() {
  return (
    <main className="marketing">
      <PublicNav />
      <SandboxClient />
      <PublicFooter />
    </main>
  );
}
