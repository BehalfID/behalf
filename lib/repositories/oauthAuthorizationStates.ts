/** Public facade for OAuth authorization states — Postgres cutover (no Mongo twin). */
import { getPostgresDb } from "@/lib/db/postgres";
import * as pg from "@/lib/repositories/postgres/oauthAuthorizationStates";
import type { ExternalIdentityProvider } from "@/lib/repositories/postgres/externalIdentities";

export type {
  OAuthAuthorizationStateLean,
  OAuthFlowMode,
  CreateOAuthAuthorizationStateInput
} from "@/lib/repositories/postgres/oauthAuthorizationStates";

export async function createOAuthAuthorizationState(input: pg.CreateOAuthAuthorizationStateInput) {
  return pg.createOAuthAuthorizationState(getPostgresDb(), input);
}

export async function consumeOAuthAuthorizationState(options: {
  stateHash: string;
  provider: ExternalIdentityProvider;
  now?: Date;
}) {
  return pg.consumeOAuthAuthorizationState(getPostgresDb(), options);
}

export async function deleteExpiredOAuthAuthorizationStates(before?: Date) {
  return pg.deleteExpiredOAuthAuthorizationStates(getPostgresDb(), before);
}
