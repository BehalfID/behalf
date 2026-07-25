import { and, desc, eq, type SQL } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { enterpriseInquiries } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type { CreateEnterpriseInquiryInput } from "@/lib/repositories/enterpriseInquiries";

type InquiryRow = typeof enterpriseInquiries.$inferSelect;
type InquiryInsert = typeof enterpriseInquiries.$inferInsert;

export type EnterpriseInquiryDomain = InquiryRow;

export async function createEnterpriseInquiry(
  db: BehalfPostgresDb,
  input: CreateEnterpriseInquiryInput
) {
  try {
    const [row] = await db
      .insert(enterpriseInquiries)
      .values({
        inquiryId: input.inquiryId,
        name: input.name,
        email: input.email,
        company: input.company,
        message: input.message,
        status: input.status ?? "new"
      })
      .returning();
    if (!row) throw new Error("createEnterpriseInquiry failed to return a row");
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function listEnterpriseInquiries(
  db: BehalfPostgresDb
): Promise<EnterpriseInquiryDomain[]> {
  return db.query.enterpriseInquiries.findMany({
    orderBy: desc(enterpriseInquiries.createdAt)
  });
}

export async function findEnterpriseInquiry(
  db: BehalfPostgresDb,
  inquiryId: string
): Promise<EnterpriseInquiryDomain | null> {
  return (
    (await db.query.enterpriseInquiries.findFirst({
      where: eq(enterpriseInquiries.inquiryId, inquiryId)
    })) ?? null
  );
}

export async function updateEnterpriseInquiry(
  db: BehalfPostgresDb,
  inquiryId: string,
  update: Partial<Pick<InquiryInsert, "status" | "name" | "email" | "company" | "message">>
) {
  const [row] = await db
    .update(enterpriseInquiries)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(enterpriseInquiries.inquiryId, inquiryId))
    .returning();
  return row ?? null;
}

function buildInquiryWhere(filter: Record<string, unknown> = {}): SQL | undefined {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === "inquiryId" && typeof value === "string") {
      conditions.push(eq(enterpriseInquiries.inquiryId, value));
      continue;
    }
    if (key === "status" && typeof value === "string") {
      conditions.push(eq(enterpriseInquiries.status, value));
      continue;
    }
    if (key === "email" && typeof value === "string") {
      conditions.push(eq(enterpriseInquiries.email, value));
      continue;
    }
    throw new Error(`Unsupported enterprise inquiry filter field: ${key}`);
  }
  return conditions.length ? and(...conditions) : undefined;
}

export async function findEnterpriseInquiries(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
): Promise<EnterpriseInquiryDomain[]> {
  return db.query.enterpriseInquiries.findMany({
    where: buildInquiryWhere(filter),
    orderBy: desc(enterpriseInquiries.createdAt)
  });
}

export async function findOneAndUpdateEnterpriseInquiry(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  const where = buildInquiryWhere(filter);
  const before = await db.query.enterpriseInquiries.findFirst({ where });
  if (!before) return null;

  const source =
    update.$set && typeof update.$set === "object"
      ? (update.$set as Record<string, unknown>)
      : Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$")));

  const [row] = await db
    .update(enterpriseInquiries)
    .set({
      ...(source as Partial<InquiryInsert>),
      updatedAt: new Date()
    })
    .where(eq(enterpriseInquiries.inquiryId, before.inquiryId))
    .returning();

  const returnAfter = options.returnDocument === "after" || options.new === true;
  return returnAfter ? (row ?? null) : before;
}

export function createPostgresEnterpriseInquiryRepository(db: BehalfPostgresDb) {
  return {
    create: (input: CreateEnterpriseInquiryInput) => createEnterpriseInquiry(db, input),
    find: (filter?: Record<string, unknown>) => findEnterpriseInquiries(db, filter),
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => findOneAndUpdateEnterpriseInquiry(db, filter, update, options)
  };
}

export type PostgresEnterpriseInquiryRepository = ReturnType<
  typeof createPostgresEnterpriseInquiryRepository
>;
