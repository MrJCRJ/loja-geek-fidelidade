import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { ENROLL_STEPS } from "./enrollSteps";

export type PoseId = (typeof ENROLL_STEPS)[number]["id"];

export type PoseCheck = {
  ok: boolean;
  tip: string;
  hasFace: boolean;
  yaw: number;
  pitch: number;
  smile: number;
};

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Índices Face Mesh
const NOSE = 1;
const CHIN = 152;
const FOREHEAD = 10;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

let landmarkerPromise: Promise<FaceLandmarker | null> | null = null;
let lastTs = 0;

export function resetPoseClock() {
  lastTs = 0;
}

/** Carrega MediaPipe sob demanda. Retorna null se falhar (fallback API). */
export function loadFaceLandmarker(): Promise<FaceLandmarker | null> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        return await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
      } catch {
        try {
          const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
          return await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
          });
        } catch {
          return null;
        }
      }
    })();
  }
  return landmarkerPromise;
}

function blendshapeScore(result: FaceLandmarkerResult, name: string): number {
  const cats = result.faceBlendshapes?.[0]?.categories;
  if (!cats) return 0;
  const hit = cats.find((c) => c.categoryName === name);
  return hit?.score ?? 0;
}

function estimatePose(result: FaceLandmarkerResult): { yaw: number; pitch: number; smile: number } | null {
  const lm = result.faceLandmarks?.[0];
  if (!lm || lm.length < 455) return null;

  const nose = lm[NOSE];
  const chin = lm[CHIN];
  const forehead = lm[FOREHEAD];
  const left = lm[LEFT_CHEEK];
  const right = lm[RIGHT_CHEEK];

  const midX = (left.x + right.x) / 2;
  const faceW = Math.max(0.001, Math.abs(right.x - left.x));
  const midY = (forehead.y + chin.y) / 2;
  const faceH = Math.max(0.001, Math.abs(chin.y - forehead.y));

  // yaw > 0: nariz à direita no frame cru → usuário virou o rosto à própria esquerda
  const yaw = (nose.x - midX) / faceW;
  // pitch < 0: nariz mais alto → queixo levantado
  const pitch = (nose.y - midY) / faceH;

  const smile =
    (blendshapeScore(result, "mouthSmileLeft") + blendshapeScore(result, "mouthSmileRight")) / 2;

  return { yaw, pitch, smile };
}

export function checkPose(poseId: PoseId, yaw: number, pitch: number, smile: number): PoseCheck {
  // Limiares um pouco mais frouxos para celular (luz/ângulo variáveis).
  const FRONT_YAW = 0.14;
  const FRONT_PITCH = 0.16;
  const SIDE_YAW = 0.11;
  const UP_PITCH = -0.08;
  const SMILE_MIN = 0.25;

  switch (poseId) {
    case "front":
      if (Math.abs(yaw) <= FRONT_YAW && Math.abs(pitch) <= FRONT_PITCH) {
        return { ok: true, tip: "Frente OK — mantém!", hasFace: true, yaw, pitch, smile };
      }
      if (Math.abs(yaw) > FRONT_YAW) {
        return {
          ok: false,
          tip: yaw > 0 ? "Olhe mais de frente (vire um pouco à direita)" : "Olhe mais de frente (vire um pouco à esquerda)",
          hasFace: true,
          yaw,
          pitch,
          smile,
        };
      }
      return {
        ok: false,
        tip: pitch < 0 ? "Abaixe um pouco o queixo" : "Levante um pouco o olhar",
        hasFace: true,
        yaw,
        pitch,
        smile,
      };

    case "left":
      // Usuário vira à própria esquerda → yaw positivo no frame cru
      if (yaw >= SIDE_YAW && Math.abs(pitch) < 0.2) {
        return { ok: true, tip: "Esquerda OK — mantém!", hasFace: true, yaw, pitch, smile };
      }
      return {
        ok: false,
        tip: "Vire o rosto à sua esquerda (como no espelho)",
        hasFace: true,
        yaw,
        pitch,
        smile,
      };

    case "right":
      if (yaw <= -SIDE_YAW && Math.abs(pitch) < 0.2) {
        return { ok: true, tip: "Direita OK — mantém!", hasFace: true, yaw, pitch, smile };
      }
      return {
        ok: false,
        tip: "Vire o rosto à sua direita (como no espelho)",
        hasFace: true,
        yaw,
        pitch,
        smile,
      };

    case "up":
      if (pitch <= UP_PITCH && Math.abs(yaw) < 0.18) {
        return { ok: true, tip: "Cima OK — mantém!", hasFace: true, yaw, pitch, smile };
      }
      return {
        ok: false,
        tip: "Levante levemente o queixo",
        hasFace: true,
        yaw,
        pitch,
        smile,
      };

    case "smile":
      if (smile >= SMILE_MIN && Math.abs(yaw) < 0.18 && Math.abs(pitch) < 0.2) {
        return { ok: true, tip: "Sorriso OK — mantém!", hasFace: true, yaw, pitch, smile };
      }
      if (smile < SMILE_MIN) {
        return { ok: false, tip: "Sorria de forma natural", hasFace: true, yaw, pitch, smile };
      }
      return {
        ok: false,
        tip: "Mantenha o rosto de frente e sorria",
        hasFace: true,
        yaw,
        pitch,
        smile,
      };

    default:
      return { ok: false, tip: "Ajuste o rosto", hasFace: true, yaw, pitch, smile };
  }
}

/** Detecta pose no frame atual do vídeo. */
export function detectPoseFromVideo(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  poseId: PoseId,
): PoseCheck {
  if (!video.videoWidth || video.readyState < 2) {
    return {
      ok: false,
      tip: "Aguardando câmera…",
      hasFace: false,
      yaw: 0,
      pitch: 0,
      smile: 0,
    };
  }

  // Timestamp monotônico exigido pelo MediaPipe VIDEO mode
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;

  const result = landmarker.detectForVideo(video, ts);
  if (!result.faceLandmarks?.length) {
    return {
      ok: false,
      tip: "Centralize o rosto no oval",
      hasFace: false,
      yaw: 0,
      pitch: 0,
      smile: 0,
    };
  }

  const pose = estimatePose(result);
  if (!pose) {
    return {
      ok: false,
      tip: "Centralize o rosto no oval",
      hasFace: false,
      yaw: 0,
      pitch: 0,
      smile: 0,
    };
  }

  return checkPose(poseId, pose.yaw, pose.pitch, pose.smile);
}
