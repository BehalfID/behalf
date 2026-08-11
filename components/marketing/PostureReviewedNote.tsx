import { POSTURE_REVIEWED, POSTURE_REVIEWED_LABEL } from "@/lib/trustPosture";

/**
 * Dated review marker for the trust pages.
 *
 * An undated compliance statement is worth very little in a security review —
 * the reader cannot tell whether "not certified yet" was written last week or
 * last year. Driven by lib/trustPosture.ts so this and the homepage strip
 * always agree.
 */
export function PostureReviewedNote({ scope = "posture" }: { scope?: string }) {
  return (
    <p className="posture-reviewed">
      This {scope} was last reviewed on{" "}
      <time dateTime={POSTURE_REVIEWED}>{POSTURE_REVIEWED_LABEL}</time>. Statuses reflect what is true on that date,
      not what is planned.
    </p>
  );
}
