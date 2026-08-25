import { useEffect, type RefObject } from "react";

type ScrollParallaxOptions = {
  /** Max translate in px (default 10) */
  maxShift?: number;
};

/**
 * Mobile-only scroll parallax: sets `--scroll-y` (-1 to 1) on the target element.
 * Disabled on fine pointers (desktop uses proximity) and reduced-motion.
 */
export function useScrollParallax(
  targetRef: RefObject<HTMLElement | null>,
  options: ScrollParallaxOptions = {},
) {
  const { maxShift = 10 } = options;

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const coarse = window.matchMedia("(pointer: coarse)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!coarse.matches || reduced.matches) return;

    let raf = 0;

    const tick = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const center = rect.top + rect.height / 2;
      const norm = (center - vh / 2) / (vh / 2);
      const clamped = Math.max(-1, Math.min(1, norm));
      el.style.setProperty("--scroll-y", clamped.toFixed(4));
      el.style.setProperty("--scroll-shift", `${(clamped * maxShift).toFixed(2)}px`);
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    tick();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      el.style.removeProperty("--scroll-y");
      el.style.removeProperty("--scroll-shift");
    };
  }, [targetRef, maxShift]);
}
