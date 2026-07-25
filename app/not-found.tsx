import Link from "next/link";
import { PublicErrorState } from "@/components/layout/PublicErrorState";

export default function NotFound() {
  return (
    <PublicErrorState
      code="404"
      title="This page could not be found."
      description="The address may have changed, or the page may no longer be available."
    >
      <Link href="/" className="public-error-state__primary">Return home</Link>
      <Link href="/docs" className="public-error-state__secondary">Browse documentation</Link>
    </PublicErrorState>
  );
}
