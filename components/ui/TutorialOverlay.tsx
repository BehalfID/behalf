"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

const TOUR_STEPS = [
  {
    id: "hero",
    selector: ".home-hero",
    title: "Meet BehalfID",
    body: "Before any AI agent action runs — a purchase, a deploy, an email — BehalfID checks whether it's allowed. Denied actions fail closed before they reach your tools.",
  },
  {
    id: "steps",
    selector: ".home-steps",
    title: "The four-stage check",
    body: "Every action goes through: (1) the agent packages the request, (2) BehalfID evaluates it against your rules, (3) a decision is returned, (4) the outcome is logged with a stable ID.",
  },
  {
    id: "integration",
    selector: ".home-code",
    title: "Three lines of integration",
    body: "Call `behalf.verify()` before your tool executor. If the decision isn't `allowed`, throw and stop — that's the entire enforcement boundary. Works with any agent framework.",
  },
  {
    id: "deploy",
    selector: ".home-deploy",
    title: "Deploy approvals: a real example",
    body: "The most common use case: staging deploys run freely, production deploys pause for your go-ahead. One rule, one approval click, zero code changes to your agent.",
  },
  {
    id: "demo",
    selector: ".home-demo",
    title: "Try it yourself",
    body: "This interactive demo runs real decision scenarios right here. Switch between Allowed, Denied, and Needs Approval to see exactly how the boundary responds.",
  },
  {
    id: "cta",
    selector: ".home-cta",
    title: "Ready to add the check?",
    body: "Install the SDK, drop in the verify call before your executor, and you have fail-closed enforcement. Denied actions never reach your tools — they stop at the boundary.",
  },
] as const;

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const PAD = 10; // padding around the spotlight ring
const CARD_WIDTH = 340;
const CARD_GAP = 16; // gap between spotlight edge and card

function getCardPosition(
  rect: SpotlightRect,
  cardHeight: number
): { top: number; left: number; placement: "below" | "above" } {
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  // Clamp left so card is always inside viewport
  const left = Math.max(16, Math.min(rect.left, vw - CARD_WIDTH - 16));

  // For very tall sections (spotlight taller than 55% of the viewport),
  // float the card at the bottom of the visible area so it's always reachable.
  if (rect.height > vh * 0.55) {
    const top = Math.max(16, vh - cardHeight - 24);
    return { top, left, placement: "above" };
  }

  const spaceBelow = vh - (rect.top + rect.height + PAD);

  const placement: "below" | "above" =
    spaceBelow >= cardHeight + CARD_GAP ? "below" : "above";

  let top =
    placement === "below"
      ? rect.top + rect.height + PAD + CARD_GAP
      : rect.top - PAD - CARD_GAP - cardHeight;

  // Hard-clamp so card never leaves the visible viewport
  top = Math.max(16, Math.min(top, vh - cardHeight - 16));

  return { top, left, placement };
}

export function TutorialOverlay({ onClose }: { onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [visible, setVisible] = useState(false); // controls spotlight opacity
  const cardRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const totalSteps = TOUR_STEPS.length;

  const scrollAndHighlight = useCallback((index: number) => {
    const step = TOUR_STEPS[index];
    const el = document.querySelector(step.selector);
    if (!el) return;

    setVisible(false);

    // Scroll into view, then wait for scroll animation to settle
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    const updateRect = () => {
      const r = el.getBoundingClientRect();
      setSpotlightRect({
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      });
      setVisible(true);
    };

    // Wait for smooth scroll + layout settle
    const t = setTimeout(updateRect, 420);
    return () => clearTimeout(t);
  }, []);

  // Initial scroll on mount
  useEffect(() => {
    const cleanup = scrollAndHighlight(0);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update spotlight on scroll/resize while tour is open
  useEffect(() => {
    const step = TOUR_STEPS[stepIndex];
    const updateRect = () => {
      const el = document.querySelector(step.selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setSpotlightRect({
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      });
    };
    window.addEventListener("scroll", updateRect, { passive: true });
    window.addEventListener("resize", updateRect, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateRect);
      window.removeEventListener("resize", updateRect);
    };
  }, [stepIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (stepIndex < totalSteps - 1) goNext();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (stepIndex > 0) goPrev();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, onClose]);

  // Focus the close button when tour opens
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const goNext = () => {
    const next = stepIndex + 1;
    setStepIndex(next);
    scrollAndHighlight(next);
  };

  const goPrev = () => {
    const prev = stepIndex - 1;
    setStepIndex(prev);
    scrollAndHighlight(prev);
  };

  const goToStep = (i: number) => {
    setStepIndex(i);
    scrollAndHighlight(i);
  };

  const currentStep = TOUR_STEPS[stepIndex];
  const cardHeight = 260; // estimated for positioning; oversized is safe
  const cardPos = spotlightRect
    ? getCardPosition(spotlightRect, cardHeight)
    : null;

  return createPortal(
    <>
      {/* Backdrop — catches clicks, allows scroll */}
      <div
        className="tour-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Spotlight ring */}
      {spotlightRect && (
        <div
          className={["tour-spotlight", visible ? "tour-spotlight--visible" : ""].filter(Boolean).join(" ")}
          aria-hidden="true"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
        />
      )}

      {/* Tour card */}
      <div
        ref={cardRef}
        className={[
          "tour-card",
          cardPos ? `tour-card--${cardPos.placement}` : "",
          visible ? "tour-card--visible" : "",
        ].filter(Boolean).join(" ")}
        style={
          cardPos
            ? { top: cardPos.top, left: cardPos.left }
            : { top: "50%", left: "50%", transform: "translate(-50%,-50%)" }
        }
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${stepIndex + 1} of ${totalSteps}: ${currentStep.title}`}
      >
        {/* Header */}
        <div className="tour-card__header">
          <span className="tour-card__step">
            {stepIndex + 1} / {totalSteps}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className="tour-card__close"
            onClick={onClose}
            aria-label="Close tour"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <h3 className="tour-card__title">{currentStep.title}</h3>
        <p className="tour-card__body">{currentStep.body}</p>

        {/* Dot indicators */}
        <div className="tour-dots" role="tablist" aria-label="Tour steps">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === stepIndex}
              aria-label={`Go to step ${i + 1}: ${TOUR_STEPS[i].title}`}
              className={["tour-dot", i === stepIndex ? "tour-dot--active" : ""].filter(Boolean).join(" ")}
              onClick={() => goToStep(i)}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="tour-card__nav">
          <button
            type="button"
            className="tour-nav-btn tour-nav-btn--back"
            onClick={goPrev}
            disabled={stepIndex === 0}
          >
            ← Back
          </button>
          {stepIndex < totalSteps - 1 ? (
            <button
              type="button"
              className="tour-nav-btn tour-nav-btn--next"
              onClick={goNext}
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              className="tour-nav-btn tour-nav-btn--finish"
              onClick={onClose}
            >
              Done ✓
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
