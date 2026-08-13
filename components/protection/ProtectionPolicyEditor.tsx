"use client";

import { useId, useMemo, useState } from "react";
import {
  DEFAULT_SPENDING_LIMITS,
  ENFORCEMENT_SURFACE_HELP,
  ENFORCEMENT_SURFACE_LABELS,
  MAX_SPENDING_LIMIT,
  PROTECTION_GUARD_LIST,
  PROTECTION_PRESET_DESCRIPTIONS,
  PROTECTION_PRESET_LABELS,
  PROTECTION_STATE_DESCRIPTIONS,
  PROTECTION_STATE_SHORT_LABELS,
  RECOMMENDED_REASONS,
  presetPolicy,
  reconcilePreset,
  recommendedStateFor,
  type ProtectionCategoryId,
  type ProtectionControl,
  type ProtectionGuardId,
  type ProtectionPolicy,
  type ProtectionPreset,
  type ProtectionState
} from "@/lib/protectionPolicy";
import {
  advancedControls,
  categoriesWithControls,
  categoryStateSummary
} from "@/lib/protectionPolicyPermissions";

const PRESET_CHOICES: ProtectionPreset[] = ["recommended", "strict", "minimal"];

function stateCountLine(counts: { allow: number; approve: number; block: number }) {
  const parts: string[] = [];
  if (counts.allow) parts.push(`${counts.allow} automatic`);
  if (counts.approve) parts.push(`${counts.approve} ask you`);
  if (counts.block) parts.push(`${counts.block} blocked`);
  return parts.join(" · ");
}

function SurfaceTag({ surface }: { surface: "cli" | "api" }) {
  return (
    <span className="protect-tag" data-surface={surface} title={ENFORCEMENT_SURFACE_HELP[surface]}>
      {ENFORCEMENT_SURFACE_LABELS[surface]}
    </span>
  );
}

function StateChoice({
  control,
  value,
  onChange
}: {
  control: ProtectionControl;
  value: ProtectionState;
  onChange: (next: ProtectionState) => void;
}) {
  const name = useId();
  return (
    <div className="protect-states" role="radiogroup" aria-label={`What happens when the agent tries to ${control.label.toLowerCase()}`}>
      {control.states.map((state) => (
        <label className="protect-state" data-state={state} data-active={value === state} key={state}>
          <input
            checked={value === state}
            name={name}
            onChange={() => onChange(state)}
            type="radio"
            value={state}
          />
          <span>{PROTECTION_STATE_SHORT_LABELS[state]}</span>
        </label>
      ))}
    </div>
  );
}

function ControlRow({
  control,
  value,
  onChange,
  children
}: {
  control: ProtectionControl;
  value: ProtectionState;
  onChange: (next: ProtectionState) => void;
  children?: React.ReactNode;
}) {
  const recommended = recommendedStateFor(control.id);
  const isRecommended = value === recommended;

  return (
    <div className="protect-row">
      <div className="protect-row__head">
        <div className="protect-row__text">
          <p className="protect-row__title">
            {control.label}
            {isRecommended ? <span className="protect-badge">Recommended</span> : null}
          </p>
          <p className="protect-row__desc">{control.description}</p>
        </div>
        <StateChoice control={control} onChange={onChange} value={value} />
      </div>
      <p className="protect-row__outcome">{control.outcome[value]}</p>
      {control.examples.length ? (
        <p className="protect-row__examples">
          <span>{control.conceptualExamples ? "For example" : "Such as"}:</span>
          {control.examples.map((example) => (
            <span className="protect-chip" key={example}>
              {example}
            </span>
          ))}
        </p>
      ) : null}
      {!isRecommended && RECOMMENDED_REASONS[control.id] ? (
        <p className="protect-row__hint">
          We suggest <strong>{PROTECTION_STATE_SHORT_LABELS[recommended]}</strong>:{" "}
          {RECOMMENDED_REASONS[control.id]}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function GuardRow({
  guardId,
  enabled,
  onChange
}: {
  guardId: ProtectionGuardId;
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const guard = PROTECTION_GUARD_LIST.find((item) => item.id === guardId)!;
  return (
    <div className="protect-row protect-row--guard">
      <div className="protect-row__head">
        <div className="protect-row__text">
          <p className="protect-row__title">
            {guard.label}
            {enabled ? <span className="protect-badge">Recommended</span> : null}
          </p>
          <p className="protect-row__desc">{guard.description}</p>
        </div>
        <label className="protect-switch" data-active={enabled}>
          <input checked={enabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
          <span aria-hidden="true" />
          <span className="protect-switch__label">{enabled ? "On" : "Off"}</span>
        </label>
      </div>
      <p className="protect-row__outcome">
        {enabled ? guard.outcome : "No extra protection. The setting above decides on its own."}
      </p>
      <details className="protect-details">
        <summary>See the exact list</summary>
        <ul className="protect-list">
          {guard.examples.map((example) => (
            <li key={example}>
              <code>{example}</code>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function SpendingFields({
  policy,
  onChange
}: {
  policy: ProtectionPolicy;
  onChange: (next: ProtectionPolicy) => void;
}) {
  const state = policy.controls.spend_money;
  if (state === "block") return null;

  const { enabled, approveOver, blockOver } = policy.spending;
  const setSpending = (patch: Partial<ProtectionPolicy["spending"]>) => {
    onChange({ ...policy, spending: { ...policy.spending, ...patch } });
  };

  return (
    <div className="protect-subpanel">
      <label className="protect-switch protect-switch--inline" data-active={enabled}>
        <input checked={enabled} onChange={(event) => setSpending({ enabled: event.target.checked })} type="checkbox" />
        <span aria-hidden="true" />
        <span className="protect-switch__label">Set an amount limit</span>
      </label>
      {enabled ? (
        <>
          <div className="protect-fields">
            {state === "approve" ? (
              <label>
                <span>Runs without asking, up to</span>
                <input
                  inputMode="decimal"
                  max={MAX_SPENDING_LIMIT}
                  min={0}
                  onChange={(event) =>
                    setSpending({ approveOver: Number(event.target.value || 0) })
                  }
                  type="number"
                  value={approveOver}
                />
              </label>
            ) : null}
            <label>
              <span>Refused above</span>
              <input
                inputMode="decimal"
                max={MAX_SPENDING_LIMIT}
                min={0}
                onChange={(event) => setSpending({ blockOver: Number(event.target.value || 0) })}
                type="number"
                value={blockOver}
              />
            </label>
          </div>
          <p className="protect-row__outcome">
            {state === "approve"
              ? `Up to ${approveOver} goes through on its own. Between ${approveOver} and ${blockOver} waits for you. Above ${blockOver} is refused.`
              : `Up to ${blockOver} goes through on its own. Above ${blockOver} is refused.`}
          </p>
          {blockOver < approveOver ? (
            <p className="protect-row__error" role="alert">
              The refusal amount has to be at least the automatic amount.
            </p>
          ) : null}
          <p className="protect-row__hint">
            A purchase has to say how much it costs. One that does not is refused.
          </p>
        </>
      ) : null}
    </div>
  );
}

function CategorySection({
  categoryId,
  policy,
  onChange,
  defaultOpen
}: {
  categoryId: ProtectionCategoryId;
  policy: ProtectionPolicy;
  onChange: (next: ProtectionPolicy) => void;
  defaultOpen: boolean;
}) {
  const entry = categoriesWithControls().find((item) => item.category.id === categoryId);
  if (!entry) return null;
  const counts = categoryStateSummary(policy, categoryId);
  const guards = PROTECTION_GUARD_LIST.filter((guard) => guard.category === categoryId);

  const setControl = (id: ProtectionControl["id"], state: ProtectionState) => {
    onChange(
      reconcilePreset({
        ...policy,
        controls: { ...policy.controls, [id]: state }
      })
    );
  };

  return (
    <details className="protect-category" open={defaultOpen}>
      <summary>
        <span className="protect-category__text">
          <strong>{entry.category.label}</strong>
          <span>{entry.category.description}</span>
        </span>
        <span className="protect-category__meta">
          <SurfaceTag surface={entry.category.surface} />
          <span className="protect-category__counts">{stateCountLine(counts)}</span>
        </span>
      </summary>
      <div className="protect-category__body">
        {entry.controls.map((control) => (
          <ControlRow
            control={control}
            key={control.id}
            onChange={(state) => setControl(control.id, state)}
            value={policy.controls[control.id]}
          >
            {control.id === "spend_money" ? (
              <SpendingFields onChange={(next) => onChange(reconcilePreset(next))} policy={policy} />
            ) : null}
          </ControlRow>
        ))}
        {guards.map((guard) => (
          <GuardRow
            enabled={policy.guards[guard.id]}
            guardId={guard.id}
            key={guard.id}
            onChange={(next) =>
              onChange(
                reconcilePreset({
                  ...policy,
                  guards: { ...policy.guards, [guard.id]: next }
                })
              )
            }
          />
        ))}
      </div>
    </details>
  );
}

export function ProtectionPolicyEditor({
  policy,
  onChange,
  priorityCategories = [],
  showPresets = true
}: {
  policy: ProtectionPolicy;
  onChange: (next: ProtectionPolicy) => void;
  priorityCategories?: ProtectionCategoryId[];
  showPresets?: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(policy.preset === "custom");
  // Unique per editor instance so two editors on one page never share a group.
  const presetGroup = useId();
  const categories = useMemo(() => categoriesWithControls(), []);
  const advanced = useMemo(() => advancedControls(), []);

  const applyPreset = (preset: ProtectionPreset) => {
    onChange(presetPolicy(preset));
  };

  return (
    <div className="protect-editor">
      {showPresets ? (
        <div className="protect-presets" role="radiogroup" aria-label="Starting protection level">
          {PRESET_CHOICES.map((preset) => {
            const active = policy.preset === preset;
            return (
              <label className="protect-preset" data-active={active} key={preset}>
                <input
                  checked={active}
                  name={presetGroup}
                  onChange={() => applyPreset(preset)}
                  type="radio"
                  value={preset}
                />
                <span className="protect-preset__mark" aria-hidden="true">
                  {active ? "✓" : ""}
                </span>
                <span className="protect-preset__body">
                  <strong>
                    {PROTECTION_PRESET_LABELS[preset]}
                    {preset === "recommended" ? <span className="protect-badge">Recommended</span> : null}
                  </strong>
                  <span>{PROTECTION_PRESET_DESCRIPTIONS[preset]}</span>
                </span>
              </label>
            );
          })}
          {policy.preset === "custom" ? (
            <p className="protect-presets__custom" role="status">
              You have changed the settings below, so this is now your own policy. Pick a level above to
              start over.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="protect-legend">
        {(["allow", "approve", "block"] as const).map((state) => (
          <div className="protect-legend__item" data-state={state} key={state}>
            <strong>{PROTECTION_STATE_SHORT_LABELS[state]}</strong>
            <span>{PROTECTION_STATE_DESCRIPTIONS[state]}</span>
          </div>
        ))}
      </div>

      {showPresets ? (
        <button
          aria-expanded={customOpen}
          className="protect-customize"
          onClick={() => setCustomOpen((open) => !open)}
          type="button"
        >
          {customOpen ? "Hide the details" : "Change any of this"}
        </button>
      ) : null}

      {!showPresets || customOpen ? (
        <div className="protect-categories">
          {categories.map((entry, index) => (
            <CategorySection
              categoryId={entry.category.id}
              defaultOpen={
                priorityCategories.length
                  ? priorityCategories.includes(entry.category.id)
                  : index === 0
              }
              key={entry.category.id}
              onChange={onChange}
              policy={policy}
            />
          ))}

          {advanced.length ? (
            <details className="protect-category protect-category--advanced">
              <summary>
                <span className="protect-category__text">
                  <strong>Advanced</strong>
                  <span>Controls most teams leave alone at the start.</span>
                </span>
              </summary>
              <div className="protect-category__body">
                {advanced.map((control) => (
                  <ControlRow
                    control={control}
                    key={control.id}
                    onChange={(state) =>
                      onChange(
                        reconcilePreset({
                          ...policy,
                          controls: { ...policy.controls, [control.id]: state }
                        })
                      )
                    }
                    value={policy.controls[control.id]}
                  />
                ))}
                <p className="protect-row__hint">
                  Vendor lists, file-path rules, expiry dates, and per-repository limits live in the
                  permission editor on each agent, once setup is done.
                </p>
              </div>
            </details>
          ) : null}

          <button
            className="protect-reset"
            onClick={() => applyPreset("recommended")}
            type="button"
          >
            Reset to recommended
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function protectionPolicyOrDefault(value: ProtectionPolicy | null | undefined): ProtectionPolicy {
  if (!value) return presetPolicy("recommended");
  return {
    ...value,
    spending: { ...DEFAULT_SPENDING_LIMITS, ...value.spending }
  };
}
