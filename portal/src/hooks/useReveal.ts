import { useCallback, useEffect, useRef, useState } from "react";

function revealIfInViewport(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
}

/**
 * Observes `.reveal` descendants and adds `.is-visible` once.
 * Re-scans when new `.reveal` nodes appear (async pages).
 * Respects prefers-reduced-motion.
 */
export function useReveal() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [rootVersion, setRootVersion] = useState(0);

  const setRootRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRootVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = new WeakSet<Element>();
    let io: IntersectionObserver | null = null;
    let mo: MutationObserver | null = null;
    let debounceTimer = 0;
    let fallbackTimer = 0;

    const revealPending = () => {
      root.querySelectorAll<HTMLElement>(".reveal:not(.is-visible)").forEach((n) => {
        n.classList.add("is-visible");
      });
    };

    const observeAll = () => {
      const nodes = root.querySelectorAll<HTMLElement>(".reveal");
      if (!nodes.length) return;

      if (reduced) {
        nodes.forEach((n) => n.classList.add("is-visible"));
        mo?.disconnect();
        mo = null;
        return;
      }

      if (!io) {
        io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) {
                e.target.classList.add("is-visible");
                io?.unobserve(e.target);
              }
            }
            if (root.querySelectorAll(".reveal:not(.is-visible)").length === 0) {
              mo?.disconnect();
              mo = null;
            }
          },
          { rootMargin: "0px 0px 5% 0px", threshold: 0.05 },
        );
      }

      nodes.forEach((n) => {
        if (seen.has(n) || n.classList.contains("is-visible")) return;
        seen.add(n);
        if (revealIfInViewport(n)) {
          n.classList.add("is-visible");
          return;
        }
        io!.observe(n);
      });

      window.clearTimeout(fallbackTimer);
      fallbackTimer = window.setTimeout(revealPending, 900);

      if (root.querySelectorAll(".reveal:not(.is-visible)").length === 0) {
        mo?.disconnect();
        mo = null;
      }
    };

    const scheduleObserve = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(observeAll, 80);
    };

    observeAll();

    mo = new MutationObserver(scheduleObserve);
    mo.observe(root, { childList: true, subtree: true });

    window.addEventListener("resize", scheduleObserve);
    window.addEventListener("orientationchange", scheduleObserve);

    return () => {
      window.clearTimeout(debounceTimer);
      window.clearTimeout(fallbackTimer);
      mo?.disconnect();
      io?.disconnect();
      window.removeEventListener("resize", scheduleObserve);
      window.removeEventListener("orientationchange", scheduleObserve);
    };
  }, [rootVersion]);

  return { setRef: setRootRef, rootRef, rootVersion };
}
