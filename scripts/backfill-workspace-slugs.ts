/**
 * Backfill workspace slugs for accounts missing a valid slug.
 *
 * Dry-run by default. Pass --confirm to write.
 *
 * Usage:
 *   npm run workspace-slugs:backfill
 *   npm run workspace-slugs:backfill -- --confirm
 */

import { config } from "dotenv";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { validateWorkspaceSlug } from "@/lib/workspaceSlug";
import {
  assignSlugWithDuplicateRetry,
  isMongoDuplicateKeyError
} from "@/lib/workspaceSlugServer";
import Account from "@/models/Account";

config({ path: ".env.local" });
config();

export type BackfillTotals = {
  scanned: number;
  alreadyValid: number;
  proposed: number;
  wrote: number;
  collisionResolved: number;
  invalid: number;
  errors: number;
};

export type AccountRow = {
  accountId: string;
  name: string;
  companyName?: string | null;
  slug?: string | null;
};

export type BackfillDeps = {
  confirm: boolean;
  requireMongoUri?: boolean;
  getMongoUri?: () => string | undefined;
  connect?: () => Promise<void>;
  listAccounts?: () => Promise<AccountRow[]>;
  updateSlug?: (
    accountId: string,
    slug: string
  ) => Promise<{ matchedCount: number; modifiedCount: number }>;
  findSlug?: (accountId: string) => Promise<string | null>;
  log?: (line: string) => void;
};

function seedForAccount(account: AccountRow): string {
  return (
    (typeof account.companyName === "string" && account.companyName.trim()) ||
    (typeof account.name === "string" && account.name.trim()) ||
    "workspace"
  );
}

function emptyTotals(): BackfillTotals {
  return {
    scanned: 0,
    alreadyValid: 0,
    proposed: 0,
    wrote: 0,
    collisionResolved: 0,
    invalid: 0,
    errors: 0
  };
}

export async function runWorkspaceSlugBackfill(deps: BackfillDeps): Promise<BackfillTotals> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const confirm = deps.confirm;
  const requireMongoUri = deps.requireMongoUri !== false;
  const getMongoUri = deps.getMongoUri ?? (() => process.env.MONGODB_URI);
  const totals = emptyTotals();

  if (requireMongoUri && !getMongoUri()?.trim()) {
    throw new Error("MONGODB_URI is required. No writes were performed.");
  }

  const mode = confirm ? "WRITE" : "DRY-RUN";
  log(`workspace-slugs:backfill (${mode})`);

  if (deps.connect) {
    await deps.connect();
  } else {
    await connectToDatabase();
  }

  const listAccounts =
    deps.listAccounts ??
    (async () =>
      (await Account.find({}).select("accountId name companyName slug").lean()) as AccountRow[]);

  const updateSlug =
    deps.updateSlug ??
    (async (accountId: string, slug: string) => {
      const result = await Account.updateOne(
        {
          accountId,
          $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }]
        },
        { $set: { slug } }
      );
      return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
    });

  const findSlug =
    deps.findSlug ??
    (async (accountId: string) => {
      const refreshed = await Account.findOne({ accountId }).select("slug").lean();
      return typeof refreshed?.slug === "string" ? refreshed.slug.trim().toLowerCase() : null;
    });

  const accounts = await listAccounts();
  const claimed = new Map<string, string>();

  for (const account of accounts) {
    totals.scanned += 1;

    if (!account.accountId || !account.name) {
      totals.invalid += 1;
      totals.errors += 1;
      log(`row\tstatus=invalid-existing\treason=missing-id-or-name`);
      continue;
    }

    const existing =
      typeof account.slug === "string" ? account.slug.trim().toLowerCase() : "";

    if (existing) {
      if (!validateWorkspaceSlug(existing)) {
        const owner = claimed.get(existing);
        if (owner && owner !== account.accountId) {
          totals.invalid += 1;
          totals.errors += 1;
          log(`row\tstatus=collision\tslug=${existing}`);
          continue;
        }
        claimed.set(existing, account.accountId);
        totals.alreadyValid += 1;
        log(`row\tstatus=skip-valid\tslug=${existing}`);
        continue;
      }

      totals.invalid += 1;
      totals.errors += 1;
      log(`row\tstatus=invalid-existing\tslug=${existing}`);
      continue;
    }

    const seed = seedForAccount(account);

    if (!confirm) {
      try {
        const { generateUniqueWorkspaceSlug } = await import("@/lib/workspaceSlugServer");
        let proposed = await generateUniqueWorkspaceSlug(seed, account.accountId);
        const owner = claimed.get(proposed);
        if (owner && owner !== account.accountId) {
          // Force next deterministic candidate by pretending the base is taken.
          const candidatesModule = await import("@/lib/workspaceSlugServer");
          const candidates = candidatesModule.buildWorkspaceSlugCandidates(seed, account.accountId);
          proposed =
            candidates.find((candidate) => {
              const claimOwner = claimed.get(candidate);
              return !claimOwner || claimOwner === account.accountId;
            }) ?? proposed;
          totals.collisionResolved += 1;
        }
        if (validateWorkspaceSlug(proposed)) {
          totals.invalid += 1;
          totals.errors += 1;
          log(`row\tstatus=invalid-proposed\tslug=${proposed}`);
          continue;
        }
        const stillOwned = claimed.get(proposed);
        if (stillOwned && stillOwned !== account.accountId) {
          totals.invalid += 1;
          totals.errors += 1;
          log(`row\tstatus=collision\tslug=${proposed}`);
          continue;
        }
        claimed.set(proposed, account.accountId);
        totals.proposed += 1;
        log(`row\tstatus=would-write\tslug=${proposed}`);
      } catch (error) {
        totals.errors += 1;
        log(
          `row\tstatus=error\treason=${error instanceof Error ? error.message : "allocation-failed"}`
        );
      }
      continue;
    }

    try {
      let collisionRetries = 0;
      const assigned = await assignSlugWithDuplicateRetry(seed, account.accountId, async (slug) => {
        try {
          const updated = await updateSlug(account.accountId, slug);
          if (updated.matchedCount === 0) {
            const current = await findSlug(account.accountId);
            if (current && !validateWorkspaceSlug(current)) {
              return;
            }
            const err = new Error("E11000 duplicate key error collection: accounts index: slug");
            (err as { code?: number }).code = 11000;
            throw err;
          }
        } catch (error) {
          if (isMongoDuplicateKeyError(error)) {
            collisionRetries += 1;
            throw error;
          }
          throw error;
        }
      });

      if (collisionRetries > 0) {
        totals.collisionResolved += 1;
      }

      const current = await findSlug(account.accountId);
      const finalSlug = current && !validateWorkspaceSlug(current) ? current : assigned;
      claimed.set(finalSlug, account.accountId);
      totals.wrote += 1;
      log(`row\tstatus=wrote\tslug=${finalSlug}`);
    } catch (error) {
      totals.errors += 1;
      log(
        `row\tstatus=error\treason=${error instanceof Error ? error.message : "write-failed"}`
      );
    }
  }

  log(
    [
      "summary",
      `scanned=${totals.scanned}`,
      `alreadyValid=${totals.alreadyValid}`,
      `proposed=${totals.proposed}`,
      `wrote=${totals.wrote}`,
      `collisionResolved=${totals.collisionResolved}`,
      `invalid=${totals.invalid}`,
      `errors=${totals.errors}`
    ].join("\t")
  );

  return totals;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const totals = await runWorkspaceSlugBackfill({ confirm });
  if (totals.errors > 0 || totals.invalid > 0) {
    process.exitCode = 1;
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Backfill failed.");
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => undefined);
    });
}
