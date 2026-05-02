export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function rejectUnknownFields(body: JsonRecord, allowedFields: string[]) {
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  return unknown.length ? `Unknown field: ${unknown[0]}.` : null;
}

export function parseOptionalDate(value: unknown) {
  if (value === undefined) {
    return { date: undefined as Date | undefined, error: null as string | null };
  }

  if (typeof value !== "string") {
    return { date: undefined, error: "expiresAt must be an ISO date string." };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: undefined, error: "expiresAt must be a valid ISO date string." };
  }

  return { date, error: null };
}

export function parseOptionalAmount(value: unknown) {
  if (value === undefined) {
    return { amount: undefined as number | undefined, error: null as string | null };
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { amount: undefined, error: "amount must be a non-negative number." };
  }

  return { amount: value, error: null };
}
