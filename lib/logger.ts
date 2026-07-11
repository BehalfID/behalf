import { redactSecrets } from "@/lib/secretRedaction";

type Level = 'info' | 'warn' | 'error' | 'debug';

interface Entry {
  level: Level;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

const COLORS: Record<Level, string> = {
  info:  '\x1b[36m',
  warn:  '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
};

function sanitizeLogValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(sanitizeLogValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sanitizeLogValue(item)
    ])
  );
}

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  const safeData = data ? sanitizeLogValue(data) as Record<string, unknown> : undefined;
  const entry: Entry = { level, msg: redactSecrets(msg), ts: new Date().toISOString(), ...safeData };

  if (process.env.NODE_ENV === 'production') {
    // Structured JSON for log aggregators (Vercel, Datadog, etc.)
    console.log(JSON.stringify(entry));
  } else {
    const label = `${COLORS[level]}[${level}]\x1b[0m`;
    if (safeData && Object.keys(safeData).length > 0) {
      console.log(`${label} ${entry.msg}`, safeData);
    } else {
      console.log(`${label} ${entry.msg}`);
    }
  }
}

export const logger = {
  info:  (msg: string, data?: Record<string, unknown>) => emit('info', msg, data),
  warn:  (msg: string, data?: Record<string, unknown>) => emit('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit('error', msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => emit('debug', msg, data),
};
