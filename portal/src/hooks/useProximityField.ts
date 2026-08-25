import { useEffect, type RefObject } from "react";

type ProximityOptions = {
  /** CSS selector for proximity targets (default `.prox`) */
  selector?: string;
  /** Influence radius in px (default 120) */
  radius?: number;
};

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function shouldDisable(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  if (window.matchMedia("(pointer: coarse)").matches) return true;
  return false;
}

function resetElement(el: HTMLElement) {
  el.style.setProperty("--prox", "0");
  el.style.setProperty("--prox-x", "0");
  el.style.setProperty("--prox-y", "0");
}

/**
 * Exposes cursor proximity as CSS custom properties on `.prox` elements:
 * `--prox` (0–1), `--prox-x`, `--prox-y` (-1 to 1).
 */
export function useProximityField(
  rootRef: RefObject<HTMLElement | null>,
  options: ProximityOptions = {},
) {
  const { selector = ".prox", radius = 120 } = options;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || shouldDisable()) return;

    let disabled = false;
    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarseMq = window.matchMedia("(pointer: coarse)");

    const disable = () => {
      if (disabled) return;
      disabled = true;
      root.querySelectorAll<HTMLElement>(selector).forEach(resetElement);
    };

    const enable = () => {
      if (!shouldDisable()) disabled = false;
    };

    const onPrefChange = () => (shouldDisable() ? disable() : enable());
    reducedMq.addEventListener("change", onPrefChange);
    coarseMq.addEventListener("change", onPrefChange);

    type Entry = { el: HTMLElement; cx: number; cy: number };
    let entries: Entry[] = [];
    let pointerX = -9999;
    let pointerY = -9999;
    let raf = 0;
    let scrollEndTimer = 0;

    const measure = () => {
      entries = [];
      root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        const r = el.getBoundingClientRect();
        entries.push({
          el,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
        });
      });
    };

    const tick = () => {
      raf = 0;
      if (disabled) return;

      for (const { el, cx, cy } of entries) {
        const dx = pointerX - cx;
        const dy = pointerY - cy;
        const dist = Math.hypot(dx, dy);

        if (dist > radius) {
          resetElement(el);
          continue;
        }

        const raw = 1 - dist / radius;
        const prox = smoothstep(raw);
        const len = dist || 1;
        el.style.setProperty("--prox", prox.toFixed(4));
        el.style.setProperty("--prox-x", ((dx / len) * prox).toFixed(4));
        el.style.setProperty("--prox-y", ((dy / len) * prox).toFixed(4));
      }
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (disabled) return;
      pointerX = e.clientX;
      pointerY = e.clientY;
      schedule();
    };

    const onPointerLeave = () => {
      pointerX = -9999;
      pointerY = -9999;
      root.querySelectorAll<HTMLElement>(selector).forEach(resetElement);
    };

    const onScrollEnd = () => {
      window.clearTimeout(scrollEndTimer);
      scrollEndTimer = window.setTimeout(measure, 80);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => ro.observe(el));

    const mo = new MutationObserver(measure);
    mo.observe(root, { childList: true, subtree: true });

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("scroll", onScrollEnd, { passive: true, capture: true });
    window.addEventListener("resize", measure);

    const onVis = () => {
      if (document.hidden) {
        root.querySelectorAll<HTMLElement>(selector).forEach(resetElement);
      } else {
        measure();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(scrollEndTimer);
      ro.disconnect();
      mo.disconnect();
      reducedMq.removeEventListener("change", onPrefChange);
      coarseMq.removeEventListener("change", onPrefChange);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("scroll", onScrollEnd, true);
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", onVis);
      root.querySelectorAll<HTMLElement>(selector).forEach(resetElement);
    };
  }, [rootRef, selector, radius]);
}
