"use client";

import { useState } from "react";
import { SettingsSection } from "@/components/dashboard/OperationsPrimitives";
import { Button } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";

/**
 * Self-service data export (GDPR Art. 15/20 access + portability). Downloads
 * the account/profile data the user provided directly, from
 * GET /api/auth/account/export.
 */
export function DataExportSection() {
  const { fetch: apiFetch } = useDashboardApi();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const downloadExport = async () => {
    setWorking(true);
    setError("");
    try {
      const response = await apiFetch("/api/auth/account/export");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not export your data. Try again.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameMatch?.[1] ?? "behalfid-account-export.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export your data. Try again.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <SettingsSection
      description="Download a copy of your account profile, linked identities, passkeys, workspace memberships, and identity/login history as a JSON file."
      eyebrow="Your data"
      id="data-export"
      title="Export your data"
    >
      <div className="setup-form">
        <p className="field-help">
          Verification logs and webhook delivery history are not included — view or delete
          those directly from the dashboard logs page.
        </p>
        <div className="setup-actions">
          <Button disabled={working} loading={working} onClick={() => void downloadExport()} type="button">
            {working ? "Preparing export…" : "Download my data"}
          </Button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </SettingsSection>
  );
}
