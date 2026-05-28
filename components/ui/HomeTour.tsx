"use client";

import { useState } from "react";
import { useScrollReveal } from "@/lib/useScrollReveal";
import { TutorialOverlay } from "./TutorialOverlay";

/**
 * Client island that:
 * 1. Activates the IntersectionObserver scroll-reveal fallback (for non-CSS-timeline browsers)
 * 2. Renders the "Take the tour" button + TutorialOverlay portal
 *
 * Placed inside .home-actions so it renders inline with the hero CTAs.
 */
export function HomeTour() {
  useScrollReveal();
  const [tourOpen, setTourOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="home-tour-btn"
        onClick={() => setTourOpen(true)}
        aria-label="Take the interactive tour"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          className="home-tour-btn__icon"
        >
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M5.5 5.25c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5c0 .6-.35 1.1-.85 1.37L7 7.25v1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="7" cy="9.75" r="0.6" fill="currentColor" />
        </svg>
        How it works
      </button>

      {tourOpen && <TutorialOverlay onClose={() => setTourOpen(false)} />}
    </>
  );
}
