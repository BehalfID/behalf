import * as Sentry from "@sentry/nextjs";
import { redactSecrets } from "@/lib/secretRedaction";

const dsn = process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  beforeSend(event) {
    try {
      const raw = JSON.stringify(event);
      const redacted = redactSecrets(raw);
      return JSON.parse(redacted) as typeof event;
    } catch {
      return event;
    }
  }
});
