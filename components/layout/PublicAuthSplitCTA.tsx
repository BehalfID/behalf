import { SplitCTAButton } from "@/components/ui";
import { getPublicAuthAction } from "@/lib/publicAuthAction";

export async function PublicAuthSplitCTA({
  leftLabel,
  leftHref
}: {
  leftLabel: string;
  leftHref: string;
}) {
  const authAction = await getPublicAuthAction("Log In");

  return (
    <SplitCTAButton
      leftLabel={leftLabel}
      leftHref={leftHref}
      rightLabel={authAction.label}
      rightHref={authAction.href}
    />
  );
}
