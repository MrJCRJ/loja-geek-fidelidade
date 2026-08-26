/**
 * Helpers de câmera compartilhados (admin web, portal, GeekLock).
 * Textos de erro por ambiente via CAMERA_ERROR_COPY.*.
 */

export type CameraErrorCopy = {
  insecure: string;
  denied: string;
  notFound: string;
  busy: string;
  overconstrained: string;
  security: string;
  noApi: string;
};

export const CAMERA_ERROR_COPY = {
  web: {
    insecure:
      "A câmera só funciona em HTTPS (ou localhost). Abra https://IP-DO-SERVIDOR/ — não use http://IP:8787.",
    denied:
      "Permissão da câmera negada. No Chromium: cadeado na barra de endereço → Câmera → Permitir, e recarregue.",
    notFound:
      "Nenhuma câmera encontrada. Confira se o notebook detecta a webcam e se não está desativada no BIOS.",
    busy: "Câmera ocupada por outro app. Feche Firefox/abas na porta 8100, Cheese, Zoom… e confira se o DroidCam no PC está conectado ao celular.",
    overconstrained:
      "A webcam não aceitou as restrições de vídeo. Tente de novo (o app já faz fallback automático).",
    security: "Navegador bloqueou a câmera (contexto inseguro). Use HTTPS.",
    noApi: "Este navegador não expõe getUserMedia. Use Chromium/Chrome/Edge atualizado.",
  },
  portal: {
    insecure:
      "A câmera só funciona em HTTPS (ou localhost). Abra o portal pelo link seguro (https://…).",
    denied:
      "Permissão da câmera negada. Toque no cadeado na barra de endereço → Câmera → Permitir, e tente de novo.",
    notFound: "Nenhuma câmera encontrada. Confira se o celular/notebook tem câmera disponível.",
    busy: "Câmera ocupada por outro app. Feche outras abas ou apps que usam a câmera e tente de novo.",
    overconstrained: "A câmera não aceitou as restrições de vídeo. Tente de novo.",
    security: "Navegador bloqueou a câmera (contexto inseguro). Use HTTPS.",
    noApi: "Este navegador não permite câmera. Use Chrome, Edge ou Safari atualizado.",
  },
  kiosk: {
    insecure: "Contexto inseguro para câmera.",
    denied: "Permissão da câmera negada. Permita o acesso à webcam no GeekLock.",
    notFound:
      "Nenhuma webcam encontrada. Conecte a Logitech C270 no USB e confira se o LED acende.",
    busy: "Webcam ocupada (Zoom, Discord, browser…). Feche esses apps e tente de novo.",
    overconstrained: "A Logitech C270 não aceitou as restrições de vídeo. Tentando fallback…",
    security: "Câmera bloqueada por segurança.",
    noApi: "getUserMedia indisponível neste ambiente.",
  },
} as const satisfies Record<string, CameraErrorCopy>;

export function cameraErrorMessage(
  err: unknown,
  copy: CameraErrorCopy = CAMERA_ERROR_COPY.web,
): string {
  const name = err instanceof DOMException ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err || "erro desconhecido");
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return copy.insecure;
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return copy.denied;
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return copy.notFound;
  if (name === "NotReadableError" || name === "TrackStartError") return copy.busy;
  if (name === "TimeoutError") return raw;
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return copy.overconstrained;
  }
  if (name === "SecurityError") return copy.security;
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return copy.noApi;
  }
  return `Falha na câmera: ${raw}`;
}

export function captureFrame(video: HTMLVideoElement, quality = 0.72): string {
  const canvas = document.createElement("canvas");
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function withMediaTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DOMException(message, "TimeoutError")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export type OpenCameraOptions = {
  timeoutMs?: number;
  timeoutMessage: string;
  formatError: (err: unknown) => string;
  /** Browser: exige HTTPS/localhost. Electron: false. */
  requireSecureContext?: boolean;
  /**
   * Prefere device cujo label casa com o regex (ex.: Logitech C270 no GeekLock).
   * Default: Logitech/C270, depois qualquer USB webcam (evita virtual/DroidCam).
   */
  preferLabel?: RegExp;
  preferredWidth?: number;
  preferredHeight?: number;
};

const DEFAULT_KIOSK_CAM =
  /logitech|c270|c920|c922|hd\s*webcam|usb.?camera|webcam/i;
const VIRTUAL_CAM = /droidcam|obs|virtual|loopback|snap|manycam/i;

function pickPreferredCam(
  cams: MediaDeviceInfo[],
  preferLabel?: RegExp,
): MediaDeviceInfo | undefined {
  const prefer = preferLabel || DEFAULT_KIOSK_CAM;
  const byPrefer = cams.find((d) => prefer.test(d.label));
  if (byPrefer) return byPrefer;
  const physical = cams.find((d) => d.label && !VIRTUAL_CAM.test(d.label));
  return physical || cams[0];
}

export async function openUserCamera(opts: OpenCameraOptions): Promise<MediaStream> {
  if (opts.requireSecureContext !== false && !window.isSecureContext) {
    throw new Error(opts.formatError(new DOMException("insecure", "SecurityError")));
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(opts.formatError(new Error("getUserMedia indisponível")));
  }

  const timeoutMs = opts.timeoutMs ?? 15_000;
  const widthIdeal = opts.preferredWidth ?? 1280;
  const heightIdeal = opts.preferredHeight ?? 720;
  let probe: MediaStream | null = null;
  try {
    probe = await withMediaTimeout(
      navigator.mediaDevices.getUserMedia({ audio: false, video: true }),
      timeoutMs,
      opts.timeoutMessage,
    );
  } catch (err) {
    throw new Error(opts.formatError(err));
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  const preferred = pickPreferredCam(cams, opts.preferLabel);

  probe.getTracks().forEach((t) => t.stop());

  const attempts: MediaStreamConstraints[] = [];
  if (preferred?.deviceId) {
    attempts.push({
      audio: false,
      video: {
        deviceId: { ideal: preferred.deviceId },
        width: { ideal: widthIdeal },
        height: { ideal: heightIdeal },
      },
    });
    attempts.push({
      audio: false,
      video: {
        deviceId: { ideal: preferred.deviceId },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
  }
  attempts.push(
    { audio: false, video: { width: { ideal: widthIdeal }, height: { ideal: heightIdeal } } },
    { audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
    { audio: false, video: true },
  );

  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await withMediaTimeout(
        navigator.mediaDevices.getUserMedia(constraints),
        timeoutMs,
        opts.timeoutMessage,
      );
    } catch (err) {
      lastErr = err;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "NotFoundError") {
        break;
      }
    }
  }
  throw new Error(opts.formatError(lastErr));
}

/** Câmera frontal (portal / celular) com fallbacks progressivos. */
export async function openFacingUserCamera(opts: OpenCameraOptions): Promise<MediaStream> {
  if (opts.requireSecureContext !== false && !window.isSecureContext) {
    throw new Error(opts.formatError(new DOMException("insecure", "SecurityError")));
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(opts.formatError(new Error("getUserMedia indisponível")));
  }

  const timeoutMs = opts.timeoutMs ?? 15_000;
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 960 } },
    },
    {
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    },
    { audio: false, video: { facingMode: "user" } },
    { audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
    { audio: false, video: true },
  ];

  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await withMediaTimeout(
        navigator.mediaDevices.getUserMedia(constraints),
        timeoutMs,
        opts.timeoutMessage,
      );
    } catch (err) {
      lastErr = err;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "NotFoundError") {
        break;
      }
    }
  }
  throw new Error(opts.formatError(lastErr));
}

export async function waitForVideoFrames(
  video: HTMLVideoElement,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
      return;
    }
    if ("requestVideoFrameCallback" in video) {
      await new Promise<void>((resolve) => {
        const v = video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number;
        };
        const id = window.setTimeout(() => resolve(), 200);
        v.requestVideoFrameCallback(() => {
          clearTimeout(id);
          resolve();
        });
      });
    } else {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error(
    "A câmera abriu, mas não entregou imagem. Feche outros apps da câmera, permita o acesso e tente de novo.",
  );
}

export type AttachCameraOptions = {
  timeoutMs?: number;
  timeoutMessage?: string;
  waitFrames?: boolean;
};

/** Anexa stream ao <video> e aguarda play (+ frames opcionais, útil no mobile). */
export async function attachCameraStream(
  video: HTMLVideoElement,
  stream: MediaStream,
  timeoutMessageOrOpts:
    | string
    | AttachCameraOptions = "Vídeo não iniciou (10s).",
): Promise<void> {
  const opts: AttachCameraOptions =
    typeof timeoutMessageOrOpts === "string"
      ? { timeoutMessage: timeoutMessageOrOpts }
      : timeoutMessageOrOpts;
  const timeoutMs = opts.timeoutMs ?? (opts.waitFrames ? 12_000 : 10_000);
  const timeoutMessage = opts.timeoutMessage ?? "Vídeo não iniciou (10s).";

  if (video.srcObject && video.srcObject !== stream) {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.srcObject = null;
  }

  video.setAttribute("autoplay", "");
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    let finished = false;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      if (poll != null) clearInterval(poll);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadeddata", onPlaying);
    };

    const done = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };

    const fail = (err: unknown) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const tryFinishFrames = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) done();
    };

    const tryPlay = () => {
      video
        .play()
        .then(() => {
          if (opts.waitFrames) tryFinishFrames();
          else done();
        })
        .catch((err) => {
          const name = err instanceof DOMException ? err.name : "";
          if (name === "AbortError") {
            setTimeout(() => {
              video.play().then(() => {
                if (opts.waitFrames) tryFinishFrames();
                else done();
              }).catch(fail);
            }, 120);
          } else if (name === "NotAllowedError" && opts.waitFrames) {
            /* mobile: espera playing/loadeddata */
          } else {
            fail(err);
          }
        });
    };

    const onMeta = () => tryPlay();
    const onPlaying = () => {
      if (opts.waitFrames) tryFinishFrames();
      else done();
    };

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("loadeddata", onPlaying);

    const poll = opts.waitFrames ? window.setInterval(tryFinishFrames, 100) : null;

    if (video.readyState >= 1) tryPlay();
  });

  if (opts.waitFrames) {
    await waitForVideoFrames(video);
  }
}
