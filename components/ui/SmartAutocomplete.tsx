"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SmartSuggestion } from "@/lib/smartSearch";
import { matchFieldCompletions, matchSmartSuggestions } from "@/lib/smartSearch";

export type SmartAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onSelectSuggestion?: (suggestion: SmartSuggestion) => void;
  scope?: "all" | "logs" | "docs";
  placeholder?: string;
  label?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  /** Extra dynamic suggestions (e.g. recent log actions / agent ids). */
  extraSuggestions?: readonly SmartSuggestion[];
  emptyHint?: string;
  autoFocus?: boolean;
  id?: string;
};

function kindLabel(kind: SmartSuggestion["kind"]) {
  switch (kind) {
    case "log_query":
      return "Logs";
    case "docs":
      return "Docs";
    case "page":
      return "Go to";
    case "field":
      return "Filter";
    case "knowledge":
      return "Knowledge";
    default:
      return "Suggest";
  }
}

export function SmartAutocomplete({
  value,
  onChange,
  onSubmit,
  onSelectSuggestion,
  scope = "all",
  placeholder = "Search…",
  label,
  className,
  inputClassName,
  disabled,
  extraSuggestions,
  emptyHint = "No matching suggestions",
  autoFocus,
  id
}: SmartAutocompleteProps) {
  const reactId = useId();
  const inputId = id ?? `smart-ac-${reactId}`;
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    const fieldHits = matchFieldCompletions(value);
    if (fieldHits.length) return fieldHits.slice(0, 8);
    return matchSmartSuggestions(value, { scope, limit: 8, extra: extraSuggestions });
  }, [extraSuggestions, scope, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const choose = (suggestion: SmartSuggestion) => {
    onSelectSuggestion?.(suggestion);
    if (!onSelectSuggestion) {
      onChange(suggestion.query);
      onSubmit?.(suggestion.query);
    }
    setOpen(false);
  };

  const showList = open && suggestions.length > 0;
  const showEmpty = open && value.trim().length > 0 && suggestions.length === 0;

  return (
    <div className={["smart-ac", className].filter(Boolean).join(" ")} ref={rootRef}>
      {label ? (
        <label className="smart-ac__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="smart-ac__control">
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-activedescendant={showList ? `${listboxId}-option-${activeIndex}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          className={["smart-ac__input", inputClassName].filter(Boolean).join(" ")}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              if (open) {
                setOpen(false);
                return;
              }
              (event.target as HTMLElement).blur?.();
              return;
            }
            if (event.key === "Enter") {
              if (showList && suggestions[activeIndex]) {
                event.preventDefault();
                choose(suggestions[activeIndex]);
                return;
              }
              onSubmit?.(value);
              setOpen(false);
            }
          }}
        />
      </div>

      {showList ? (
        <ul className="smart-ac__list" id={listboxId} role="listbox" aria-label="Suggestions">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} role="presentation">
              <button
                type="button"
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`smart-ac__option${index === activeIndex ? " smart-ac__option--active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(suggestion)}
              >
                <span className="smart-ac__option-kind">{kindLabel(suggestion.kind)}</span>
                <span className="smart-ac__option-main">
                  <strong>{suggestion.title}</strong>
                  <span>{suggestion.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showEmpty ? (
        <p className="smart-ac__empty" role="status">
          {emptyHint}
        </p>
      ) : null}
    </div>
  );
}
