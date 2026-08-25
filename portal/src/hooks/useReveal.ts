import { useEffect, useRef } from "react";

/**
 * Observes `.reveal` descendants and adds `.is-visible` once.
 * Re-scans when new `.reveal` nodes appear (async pages).
 * Respects prefers-reduced-motion.
 */
export function useReveal() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = new WeakSet<Element>();
    let io: IntersectionObserver | null = null;

    const observeAll = () => {
      const nodes = root.querySelectorAll<HTMLElement>(".reveal");
      if (!nodes.length) return;

      if (reduced) {
        nodes.forEach((n) => n.classList.add("is-visible"));
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
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
        );
      }

      nodes.forEach((n) => {
        if (seen.has(n) || n.classList.contains("is-visible")) return;
        seen.add(n);
        io!.observe(n);
      });
    };

    observeAll();

    const mo = new MutationObserver(() => observeAll());
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io?.disconnect();
    };
  }, []);

  return rootRef;
}
