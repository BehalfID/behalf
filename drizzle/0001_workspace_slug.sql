ALTER TABLE "accounts" ADD COLUMN "slug" text;
CREATE UNIQUE INDEX "accounts_slug_uq" ON "accounts" ("slug") WHERE "slug" IS NOT NULL;
