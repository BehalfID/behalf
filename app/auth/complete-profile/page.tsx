import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { completeProfilePath } from "@/lib/authPageUrls";

export const metadata: Metadata = {
  title: "Complete profile — BehalfID",
  description: "Finish creating your BehalfID account after OAuth sign-in.",
  robots: { index: false, follow: false }
};

/**
 * Compatibility shim for `/auth/complete-profile`.
 * Prefer the proxy 308; this covers direct App Router hits if intl is bypassed.
 */
export default async function LegacyCompleteProfileRoute({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  const qs = query.toString();
  redirect(qs ? `${completeProfilePath()}?${qs}` : completeProfilePath());
}
