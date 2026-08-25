export const ENROLL_STEPS = [
  { id: "front", label: "Frente", hint: "Olhe de frente para a câmera" },
  { id: "left", label: "Esquerda", hint: "Vire um pouco o rosto à esquerda" },
  { id: "right", label: "Direita", hint: "Vire um pouco o rosto à direita" },
  { id: "up", label: "Cima", hint: "Levante levemente o queixo" },
  { id: "smile", label: "Sorriso", hint: "Sorria naturalmente" },
] as const;

export type EnrollOverlayState = "idle" | "detecting" | "ready" | "saved" | "error";
