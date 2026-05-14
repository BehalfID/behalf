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

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  const entry: Entry = { level, msg, ts: new Date().toISOString(), ...data };

  if (process.env.NODE_ENV === 'production') {
    // Structured JSON for log aggregators (Vercel, Datadog, etc.)
    console.log(JSON.stringify(entry));
  } else {
    const label = `${COLORS[level]}[${level}]\x1b[0m`;
    if (data && Object.keys(data).length > 0) {
      console.log(`${label} ${msg}`, data);
    } else {
      console.log(`${label} ${msg}`);
    }
  }
}

export const logger = {
  info:  (msg: string, data?: Record<string, unknown>) => emit('info', msg, data),
  warn:  (msg: string, data?: Record<string, unknown>) => emit('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit('error', msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => emit('debug', msg, data),
};
