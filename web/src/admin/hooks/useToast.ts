import { useCallback, useRef, useState } from "react";
import type { ToastItem, ToastKind } from "../types";

let toastSeq = 1;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (text: string, kind: ToastKind = "info") => {
      const id = toastSeq++;
      setToasts((prev) => [...prev.slice(-4), { id, kind, text }]);
      const timer = window.setTimeout(() => dismiss(id), 4200);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}
