"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** True when the user asked the OS to reduce motion. SSR-safe. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Fires once when the element scrolls into view. */
export function useInView<T extends HTMLElement = HTMLDivElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      const id = window.requestAnimationFrame(() => setInView(true));
      return () => window.cancelAnimationFrame(id);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, inView };
}

type SequenceOptions = {
  /** ms each step is held */
  interval?: number;
  /** extra pause, in ms, once the final step is reached before looping */
  restAtEnd?: number;
  /** loop back to the start instead of holding the final state */
  loop?: boolean;
};

/**
 * Drives an explanatory step sequence. Starts when visible, pauses when the
 * reader takes over or hovers, and jumps straight to the final state when the
 * user prefers reduced motion.
 */
export function useSequence(
  count: number,
  { interval = 1800, restAtEnd = 2600, loop = false }: SequenceOptions = {}
) {
  const { ref, inView } = useInView(0.3);
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState(false);

  // Prefer derived final step under reduced motion — avoid sync setState in effects.
  const current = reduced ? Math.max(count - 1, 0) : active;

  useEffect(() => {
    if (reduced || !inView || paused || manual) return;
    const last = current >= count - 1;
    if (last && !loop) return;
    const delay = last ? restAtEnd : interval;
    const id = window.setTimeout(
      () => setActive((v) => (v + 1 >= count ? (loop ? 0 : count - 1) : v + 1)),
      delay
    );
    return () => window.clearTimeout(id);
  }, [reduced, inView, paused, manual, current, count, interval, restAtEnd, loop]);

  const select = useCallback((i: number) => {
    setManual(true);
    setActive(i);
  }, []);

  const replay = useCallback(() => {
    setManual(false);
    setPaused(false);
    setActive(0);
  }, []);

  return {
    ref,
    active: current,
    select,
    replay,
    paused,
    manual,
    reduced,
    setPaused,
    isPlaying: !reduced && inView && !paused && !manual
  };
}
