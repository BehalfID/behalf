import crypto from "crypto";

export function hashCliRepo(value: string | null | undefined): string | null {
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}
