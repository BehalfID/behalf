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
import {
  accountIdSlugSuffix,
  normalizeWorkspaceSlug,
  validateWorkspaceSlug,
  WORKSPACE_SLUG_MAX_LENGTH,
  WORKSPACE_SLUG_PATTERN,
  isReservedWorkspaceSlug
} from "@/lib/workspaceSlug";
import { generateUniqueWorkspaceSlug } from "@/lib/workspaceSlugServer";
import Account from "@/models/Account";

config({ path: ".env.local" });
config();

type RowStatus =
  | "skip-valid"
  | "would-write"
  | "wrote"
  | "collision"
  | "invalid-existing"
  | "invalid-proposed";

type AccountRow = {
  accountId: string;
  name: string;
  companyName?: string | null;
  slug?: string | null;
};

function withAccountSuffix(base: string, accountId: string): string {
  const suffix = accountIdSlugSuffix(accountId);
  const sep = "-";
  const maxBase = WORKSPACE_SLUG_MAX_LENGTH - sep.length - suffix.length;
  const trimmedBase =
    base.slice(0, Math.max(1, maxBase)).replace(/-+$/g, "") || "workspace";
  const candidate = `${trimmedBase}${sep}${suffix}`;
  if (isReservedWorkspaceSlug(candidate) || !WORKSPACE_SLUG_PATTERN.test(candidate)) {
    return `workspace-${suffix}`.slice(0, WORKSPACE_SLUG_MAX_LENGTH);
  }
  return candidate;
}

function printRow(
  accountId: string,
  name: string,
  proposedSlug: string,
  status: RowStatus
) {
  console.log(`${accountId}\t${name}\t${proposedSlug}\t${status}`);
}

async function proposeSlug(
  account: AccountRow,
  claimed: Map<string, string>
): Promise<{ slug: string; status: "ok" | "collision" | "invalid-proposed" }> {
  const seed =
    (typeof account.companyName === "string" && account.companyName.trim()) ||
    (typeof account.name === "string" && account.name.trim()) ||
    "workspace";

  let proposed = await generateUniqueWorkspaceSlug(seed, account.accountId);
  const owner = claimed.get(proposed);
  if (owner && owner !== account.accountId) {
    proposed = withAccountSuffix(normalizeWorkspaceSlug(seed), account.accountId);
  }

  const stillOwned = claimed.get(proposed);
  if (stillOwned && stillOwned !== account.accountId) {
    return { slug: proposed, status: "collision" };
  }

  if (validateWorkspaceSlug(proposed)) {
    return { slug: proposed, status: "invalid-proposed" };
  }

  return { slug: proposed, status: "ok" };
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const mode = confirm ? "WRITE" : "DRY-RUN";
  console.log(`workspace-slugs:backfill (${mode})`);
  console.log("accountId\tname\tproposedSlug\tstatus");

  await connectToDatabase();

  const accounts = (await Account.find({})
    .select("accountId name companyName slug")
    .lean()) as AccountRow[];

  const claimed = new Map<string, string>();
  let failures = 0;
  let writes = 0;
  let skips = 0;
  let pending = 0;

  for (const account of accounts) {
    if (!account.accountId || !account.name) {
      printRow(account.accountId ?? "(missing)", account.name ?? "(missing)", "", "invalid-existing");
      failures += 1;
      continue;
    }

    const existing =
      typeof account.slug === "string" ? account.slug.trim().toLowerCase() : "";

    if (existing) {
      if (!validateWorkspaceSlug(existing)) {
        const owner = claimed.get(existing);
        if (owner && owner !== account.accountId) {
          printRow(account.accountId, account.name, existing, "collision");
          failures += 1;
          continue;
        }
        claimed.set(existing, account.accountId);
        printRow(account.accountId, account.name, existing, "skip-valid");
        skips += 1;
        continue;
      }

      // Existing slug is present but invalid — never overwrite; fail closed.
      printRow(account.accountId, account.name, existing, "invalid-existing");
      failures += 1;
      continue;
    }

    const result = await proposeSlug(account, claimed);
    if (result.status !== "ok") {
      printRow(account.accountId, account.name, result.slug, result.status);
      failures += 1;
      continue;
    }

    claimed.set(result.slug, account.accountId);

    if (!confirm) {
      printRow(account.accountId, account.name, result.slug, "would-write");
      pending += 1;
      continue;
    }

    const updated = await Account.updateOne(
      {
        accountId: account.accountId,
        $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }]
      },
      { $set: { slug: result.slug } }
    );

    if (updated.modifiedCount !== 1) {
      // Another writer may have set a slug; re-read and fail closed if unexpected.
      const refreshed = await Account.findOne({ accountId: account.accountId })
        .select("slug")
        .lean();
      const current =
        typeof refreshed?.slug === "string" ? refreshed.slug.trim().toLowerCase() : "";
      if (current && !validateWorkspaceSlug(current)) {
        printRow(account.accountId, account.name, current, "skip-valid");
        skips += 1;
        continue;
      }
      printRow(account.accountId, account.name, result.slug, "collision");
      failures += 1;
      continue;
    }

    printRow(account.accountId, account.name, result.slug, "wrote");
    writes += 1;
  }

  console.log(
    `summary\tskips=${skips}\tpending=${pending}\twrites=${writes}\tfailures=${failures}`
  );

  if (failures > 0) {
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
