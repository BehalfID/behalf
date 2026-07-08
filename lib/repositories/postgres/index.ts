/**
 * Test-only Postgres repository adapters — not exported from lib/repositories/index.ts.
 * Production runtime continues to use Mongo/Mongoose repositories.
 */

export {
  findAccountById,
  incrementVerificationCount,
  resetVerificationPeriod
} from "@/lib/repositories/postgres/accounts";
export { countAgentsByAccountId, countAgentsByScope } from "@/lib/repositories/postgres/agents";
