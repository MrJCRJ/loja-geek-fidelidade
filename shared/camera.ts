/**
 * Helpers de câmera compartilhados (web admin + GeekLock).
 * Mensagens de erro específicas ficam em cada app.
 */

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
};

export async function openUserCamera(opts: OpenCameraOptions): Promise<MediaStream> {
  if (opts.requireSecureContext !== false && !window.isSecureContext) {
    throw new Error(opts.formatError(new DOMException("insecure", "SecurityError")));
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(opts.formatError(new Error("getUserMedia indisponível")));
  }

  const timeoutMs = opts.timeoutMs ?? 15_000;
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
  const droidcam = cams.find((d) => /droidcam|loopback|dc/i.test(d.label));

  probe.getTracks().forEach((t) => t.stop());

  const attempts: MediaStreamConstraints[] = [];
  if (droidcam?.deviceId) {
    attempts.push({
      audio: false,
      video: {
        deviceId: { ideal: droidcam.deviceId },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
  }
  attempts.push(
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

export async function attachCameraStream(
  video: HTMLVideoElement,
  stream: MediaStream,
  timeoutMessage = "Vídeo não iniciou (10s).",
): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(timeoutMessage)), 10_000);
    const done = () => {
      clearTimeout(timeout);
      resolve();
    };
    const fail = (err: unknown) => {
      clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const tryPlay = () => {
      video
        .play()
        .then(done)
        .catch((err) => {
          const name = err instanceof DOMException ? err.name : "";
          if (name === "AbortError") {
            setTimeout(() => video.play().then(done).catch(fail), 120);
          } else {
            fail(err);
          }
        });
    };
    video.onloadedmetadata = () => tryPlay();
    if (video.readyState >= 1) {
      video.onloadedmetadata = null;
      tryPlay();
    }
  });
}
