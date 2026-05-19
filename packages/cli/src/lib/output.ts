let _json = false;

export function setJsonMode(on: boolean) { _json = on; }
export function isJsonMode() { return _json; }

export function redactSecrets(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/bhf_sk_[A-Za-z0-9._~+/-]+=*/g, "bhf_sk_[redacted]")
    .replace(/bhf_dev_[A-Za-z0-9._~+/-]+=*/g, "bhf_dev_[redacted]")
    .replace(/bhf_pass_[A-Za-z0-9._~+/-]+=*/g, "bhf_pass_[redacted]")
    .replace(/whsec_[A-Za-z0-9._~+/-]+=*/g, "whsec_[redacted]");
}

export function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

export function printError(message: string) {
  const safeMessage = redactSecrets(message);
  if (_json) {
    console.error(JSON.stringify({ error: safeMessage }));
  } else {
    console.error(`Error: ${safeMessage}`);
  }
}

export function printSuccess(message: string) {
  if (!_json) console.log(message);
}

type Row = Record<string, string | number | boolean | null | undefined>;

export function printTable(rows: Row[], columns?: string[]) {
  if (rows.length === 0) {
    console.log("(none)");
    return;
  }
  const keys = columns ?? Object.keys(rows[0]);
  const widths = keys.map(k =>
    Math.max(k.length, ...rows.map(r => String(r[k] ?? "").length))
  );
  const sep = widths.map(w => "─".repeat(w)).join("  ");
  console.log(keys.map((k, i) => k.toUpperCase().padEnd(widths[i])).join("  "));
  console.log(sep);
  for (const row of rows) {
    console.log(keys.map((k, i) => String(row[k] ?? "").padEnd(widths[i])).join("  "));
  }
}

export function printKv(pairs: Record<string, string | number | boolean | null | undefined>) {
  const keyWidth = Math.max(...Object.keys(pairs).map(k => k.length));
  for (const [k, v] of Object.entries(pairs)) {
    console.log(`${k.padEnd(keyWidth)}  ${v ?? ""}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function runAction(fn: (...args: any[]) => Promise<void>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (...args: any[]) => {
    (fn(...args) as Promise<void>).catch((err: unknown) => {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
  };
}
