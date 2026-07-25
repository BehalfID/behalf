"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PublicErrorState } from "@/components/layout/PublicErrorState";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PublicErrorState
      code="Request interrupted"
      title="We could not load this page."
      description="Try the request again. If the problem continues, check service status or contact support."
    >
      <button type="button" className="public-error-state__primary" onClick={reset}>Try again</button>
      <Link href="/status" className="public-error-state__secondary">Check service status</Link>
    </PublicErrorState>
  );
}
