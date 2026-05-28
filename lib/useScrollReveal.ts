"use client";

import { useEffect } from "react";

/**
 * IntersectionObserver fallback for scroll-driven animations.
 * CSS `animation-timeline: view()` handles modern browsers automatically.
 * This hook adds `.is-revealed` to `[data-reveal]` elements for older
 * browsers (Safari < 18, Firefox < 133) that don't support scroll timelines.
 */
export function useScrollReveal() {
  useEffect(() => {
    // If animation-timeline: view() is supported, CSS handles everything
    if (CSS.supports("animation-timeline", "view()")) return;

    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    elements.forEach((el) => {
      // If element is already in view on mount (above fold), reveal immediately
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) {
        el.classList.add("is-revealed");
      } else {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, []);
}
