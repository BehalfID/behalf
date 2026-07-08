import { count, eq } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { agents } from "@/lib/db/postgres/schema";
import type { AgentCountScope } from "@/lib/repositories/agents";

export async function countAgentsByAccountId(db: BehalfPostgresDb, accountId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(agents)
    .where(eq(agents.accountId, accountId));

  return row?.value ?? 0;
}

export async function countAgentsByScope(db: BehalfPostgresDb, scope: AgentCountScope) {
  const filter =
    "accountId" in scope
      ? eq(agents.accountId, scope.accountId)
      : eq(agents.developerUserId, scope.developerUserId);

  const [row] = await db.select({ value: count() }).from(agents).where(filter);

  return row?.value ?? 0;
}
