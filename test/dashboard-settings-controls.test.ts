/**
 * Static source checks for the Settings & members workspace form polish
 * (Dashboard Settings Control Cards Polish v1).
 *
 * Guards that the Agent tools / Control areas checkbox groups render as
 * compact setting rows with native inputs, that the polished row states
 * exist in the stylesheet, and that the save actions use the shared
 * setup-actions pattern.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTROL_AREAS, CONTROL_POLICY_HINTS } from "@/lib/onboarding";

const clientSource = readFileSync(join(process.cwd(), "app/dashboard/client.tsx"), "utf-8");
const cssSource = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");

describe("dashboard settings control rows", () => {
  it("renders workspace checkboxes as compact setting rows", () => {
    expect(clientSource).toContain('className="setup-checkgrid setup-checkgrid--settings"');
    expect(clientSource).toContain('className="setup-check setup-check--setting"');
    expect(clientSource).toContain('className="setup-check__body"');
    expect(clientSource).toContain('className="setup-check__label"');
  });

  it("keeps accessible native checkbox inputs inside the label", () => {
    // The label wraps the input, so clicking the label toggles the checkbox.
    const settingRows = clientSource.split('className="setup-check setup-check--setting"');
    expect(settingRows.length).toBeGreaterThanOrEqual(3);
    for (const row of settingRows.slice(1)) {
      expect(row.slice(0, 600)).toContain('type="checkbox"');
    }
    // Inputs must not be visually removed in a way that breaks keyboard nav.
    expect(cssSource).not.toMatch(/\.setup-check--setting[^{]*\{[^}]*display:\s*none/);
    expect(cssSource).not.toMatch(/\.setup-check--setting\s+input[^{]*\{[^}]*visibility:\s*hidden/);
  });

  it("shows the shared control-policy hint copy under control area labels", () => {
    expect(clientSource).toContain("CONTROL_POLICY_HINTS[area]");
    for (const area of CONTROL_AREAS) {
      expect(CONTROL_POLICY_HINTS[area]).toBeTruthy();
    }
  });

  it("defines hover, checked, focus-visible, and disabled row states", () => {
    expect(cssSource).toContain(".setup-check--setting:hover");
    expect(cssSource).toContain(".setup-check--setting:has(input:checked)");
    expect(cssSource).toContain(".setup-check--setting:has(input:focus-visible)");
    expect(cssSource).toContain(".setup-check--setting:has(input:disabled)");
  });

  it("collapses the settings check grid to one column on small screens", () => {
    const occurrences = cssSource.split(".setup-checkgrid--settings").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("wraps the workspace save button in the shared setup-actions row", () => {
    expect(clientSource).toMatch(/setup-actions">\s*<Button loading=\{saveWorking === "account"\} type="submit" variant="primary">Save workspace<\/Button>/);
  });

  it("renders the members panel exactly once with its coordinated resource", () => {
    const matches = clientSource.match(/<MembersPanel members=\{members\} \/>/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
