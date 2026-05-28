import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { SandboxClient } from "./sandbox-client";

export const metadata = {
  title: "Decision Lab — BehalfID",
  description: "See how BehalfID stops unsafe AI actions before tools run. Choose an action, run it through a permission passport, and see the decision.",
  alternates: { canonical: "/sandbox" }
};

export default function SandboxPage() {
  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />
      <SandboxClient />
      <PublicFooter />
    </main>
  );
}
