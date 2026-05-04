import { PublicNav } from "@/components/layout/PublicNav";
import { SandboxClient } from "./sandbox-client";

export const metadata = {
  title: "Enforcement sandbox — BehalfID",
  description: "See how BehalfID fails denied actions closed before they happen. No real agents or secrets."
};

export default function SandboxPage() {
  return (
    <main className="marketing">
      <PublicNav />
      <SandboxClient />
    </main>
  );
}
