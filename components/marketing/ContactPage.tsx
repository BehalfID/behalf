"use client";

import { useState, type FormEvent } from "react";
import { MarketingLayout, Section, SectionHeading } from "@/components/design-system/MarketingLayout";
import { ChevronDown } from "@/components/design-system/icons";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

/* Literal Lovable form-primitive classes (src/components/ui/{input,textarea,label,select}.tsx). */
const labelClass = "text-sm font-medium leading-none";

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

const textareaClass =
  "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/* Lovable renders Topic through a Radix SelectTrigger (a <button> with a chevron),
   so no native control chrome is ever visible. We keep the accessible native
   <select> underneath — full keyboard and platform selection behaviour — and
   reset its appearance to match the source trigger, drawing our own chevron.
   `appearance-none` is required for WebKit/Safari, which otherwise paints its
   own arrows on top. */
const selectClass =
  "flex h-9 w-full appearance-none items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent py-2 pl-3 pr-7 text-sm shadow-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const submitClass =
  "mt-5 inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export function ContactPage({
  authAction,
  googleEnabled
}: {
  authAction: PublicAuthAction;
  googleEnabled: boolean;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setDone(false);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const company = String(form.get("company") || "").trim();
    const topic = String(form.get("topic") || "enterprise").trim();
    const body = String(form.get("message") || "").trim();
    const message = body ? `[${topic}] ${body}` : `[${topic}]`;

    try {
      const response = await fetch("/api/billing/enterprise-inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, company, message })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error || "Unable to send your message. Please try again.");
        setSending(false);
        return;
      }
      setDone(true);
      event.currentTarget.reset();
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <MarketingLayout authAction={authAction} googleEnabled={googleEnabled} showEnding={false}>
      <Section className="border-b-0">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
          <div>
            <SectionHeading
              eyebrow="Contact"
              title="Talk to the team"
              description="Enterprise rollout, customer-managed deployments, security questionnaires, procurement, and product support."
            />
            <dl className="mt-8 space-y-5 text-sm">
              <div>
                <dt className="font-medium">Security</dt>
                <dd className="text-muted-foreground">
                  <a href="mailto:security@behalfid.com">security@behalfid.com</a> — vulnerability reports and reviews
                </dd>
              </div>
              <div>
                <dt className="font-medium">Support</dt>
                <dd className="text-muted-foreground">
                  <a href="mailto:support@behalfid.com">support@behalfid.com</a> — existing workspaces and product
                  support
                </dd>
              </div>
              <div>
                <dt className="font-medium">Response time</dt>
                <dd className="text-muted-foreground">One business day for security, two for general enquiries</dd>
              </div>
            </dl>
          </div>

          <form className="rounded-xl border bg-surface p-6" onSubmit={onSubmit}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="contact-name" className={labelClass}>
                    Name
                  </label>
                  <input id="contact-name" name="name" autoComplete="name" required className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="contact-email" className={labelClass}>
                    Work email
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-company" className={labelClass}>
                  Company
                </label>
                <input
                  id="contact-company"
                  name="company"
                  autoComplete="organization"
                  required
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-topic" className={labelClass}>
                  Topic
                </label>
                <div className="relative">
                  <select id="contact-topic" name="topic" defaultValue="enterprise" className={selectClass}>
                    <option value="enterprise">Enterprise rollout</option>
                    <option value="self-hosted">Customer-managed deployment</option>
                    <option value="security">Security review</option>
                    <option value="support">Product support</option>
                  </select>
                  <ChevronDown
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-message" className={labelClass}>
                  How can we help?
                </label>
                <textarea id="contact-message" name="message" rows={5} required className={textareaClass} />
              </div>
            </div>
            {error ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {done ? (
              <p className="mt-4 text-sm text-success" role="status">
                Message sent. We&apos;ll follow up shortly.
              </p>
            ) : null}
            <button type="submit" className={submitClass} disabled={sending}>
              {sending ? "Sending…" : "Send message"}
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              Submissions go to the enterprise inquiry inbox used by production billing support.
            </p>
          </form>
        </div>
      </Section>
    </MarketingLayout>
  );
}
