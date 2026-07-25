import type { Metadata } from "next";
import { Suspense } from "react";
import { CompleteProfilePage } from "./complete-profile-client";

export const metadata: Metadata = {
  title: "Complete profile — BehalfID",
  description: "Finish creating your BehalfID account after Google sign-in.",
  robots: { index: false, follow: false }
};

export default function CompleteProfileRoute() {
  return (
    <Suspense fallback={<main className="auth-page"><p>Loading…</p></main>}>
      <CompleteProfilePage />
    </Suspense>
  );
}
