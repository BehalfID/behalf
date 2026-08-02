"use client";

import { useState, type FormEvent } from "react";
import { MarketingLayout, Section, SectionHeading } from "@/components/design-system/MarketingLayout";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

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
      <Section>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
          <div>
            <SectionHeading
              eyebrow="Contact"
              title="Talk to the team"
              description="Enterprise rollout, security questionnaires, procurement, and product support."
            />
            <dl className="mt-8 space-y-5 text-sm">
              <div>
                <dt className="font-medium">Security</dt>
                <dd className="text-muted-foreground">
                  <a href="mailto:security@behalfid.com">security@behalfid.com</a> — vulnerability reports and reviews
                </dd>
              </div>
              <div>
                <dt className="font-medium">Sales &amp; enterprise</dt>
                <dd className="text-muted-foreground">Use the form — inquiries are stored for the BehalfID team.</dd>
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
                  <label htmlFor="contact-name" className="text-sm font-medium">
                    Name
                  </label>
                  <input
                    id="contact-name"
                    name="name"
                    autoComplete="name"
                    required
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="contact-email" className="text-sm font-medium">
                    Work email
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-company" className="text-sm font-medium">
                  Company
                </label>
                <input
                  id="contact-company"
                  name="company"
                  autoComplete="organization"
                  required
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-topic" className="text-sm font-medium">
                  Topic
                </label>
                <select
                  id="contact-topic"
                  name="topic"
                  defaultValue="enterprise"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="enterprise">Enterprise rollout</option>
                  <option value="self-hosted">Customer-managed deployment</option>
                  <option value="security">Security review</option>
                  <option value="support">Product support</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-message" className="text-sm font-medium">
                  How can we help?
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={5}
                  required
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
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
            <button
              type="submit"
              className="mt-5 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
              disabled={sending}
            >
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
