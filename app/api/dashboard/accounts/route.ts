import { type NextRequest } from "next/server";
import { listUserAccounts } from "@/lib/accountContext";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { noCacheJson } from "@/lib/responses";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const accounts = await listUserAccounts(auth.user.userId, auth.user.primaryAccountId);

  return noCacheJson({
    activeAccountId: auth.activeAccountId,
    accounts
  });
}
