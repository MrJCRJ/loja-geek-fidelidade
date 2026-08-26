export const ENROLL_STEPS = [
  {
    id: "front",
    label: "Frente",
    hint: "Olhe de frente · luz no rosto (não contraluz) · tire óculos escuros/boné se puder",
  },
  {
    id: "left",
    label: "Esquerda",
    hint: "Vire ~30° à esquerda · mantenha o rosto iluminado",
  },
  {
    id: "right",
    label: "Direita",
    hint: "Vire ~30° à direita · sem sombra forte no lado do rosto",
  },
  {
    id: "up",
    label: "Cima",
    hint: "Levante um pouco o queixo · câmera na altura dos olhos",
  },
  {
    id: "smile",
    label: "Sorriso",
    hint: "Sorria naturalmente · se falhar, aproxime um pouco e repita",
  },
] as const;

export type EnrollOverlayState = "idle" | "detecting" | "ready" | "saved" | "error";
