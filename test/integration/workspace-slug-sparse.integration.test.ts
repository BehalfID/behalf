/**
 * Mongo contract: unique sparse slug index allows multiple documents that omit the slug key.
 */
import { describe, expect, it } from "vitest";
import Account from "@/models/Account";
import { createPublicId } from "@/lib/ids";

describe("workspace slug sparse unique index", () => {
  it("allows two accounts without a slug key to coexist", async () => {
    const accountIdA = createPublicId("acct");
    const accountIdB = createPublicId("acct");

    await Account.create({ accountId: accountIdA, name: "incomplete-a" });
    await Account.create({ accountId: accountIdB, name: "incomplete-b" });

    const docs = await Account.find({
      accountId: { $in: [accountIdA, accountIdB] }
    })
      .select("accountId name slug")
      .lean();

    expect(docs).toHaveLength(2);
    for (const doc of docs) {
      expect(Object.prototype.hasOwnProperty.call(doc, "slug")).toBe(false);
      expect(doc.slug).toBeUndefined();
    }

    // Explicit null would collide under a sparse unique index — prove omission is required.
    await expect(
      Account.collection.insertOne({
        accountId: createPublicId("acct"),
        name: "null-slug-a",
        slug: null
      })
    ).resolves.toBeTruthy();

    await expect(
      Account.collection.insertOne({
        accountId: createPublicId("acct"),
        name: "null-slug-b",
        slug: null
      })
    ).rejects.toMatchObject({ code: 11000 });
  });
});
