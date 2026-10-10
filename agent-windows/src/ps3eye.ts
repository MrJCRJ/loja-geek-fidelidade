const BRIDGE = "http://127.0.0.1:4777";

/**
 * A PlayStation Eye não entra no getUserMedia. A ponte local entrega JPEG
 * e isto vira um MediaStream para o restante do GeekLock.
 */
export async function openPs3EyeBridge(): Promise<MediaStream> {
  const deadline = Date.now() + 20_000;
  let lastError = "ponte da PlayStation Eye não respondeu";
  while (Date.now() < deadline) {
    try {
      const health = await fetch(`${BRIDGE}/health`, { cache: "no-store" });
      if (health.ok) {
        const body = (await health.json()) as { ok?: boolean; error?: string; frames?: number };
        if (body.ok || (body.frames && body.frames > 0)) break;
        if (body.error) lastError = body.error;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const probe = await fetch(`${BRIDGE}/snapshot.jpg`, { cache: "no-store" }).catch(() => null);
  if (!probe || !probe.ok) {
    throw new Error(
      `PlayStation Eye conectada, mas o vídeo não abriu. Reconecte o USB. (${lastError})`,
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;opacity:0";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível para a PlayStation Eye");

  const first = await createImageBitmap(await probe.blob());
  canvas.width = first.width || 640;
  canvas.height = first.height || 480;
  ctx.drawImage(first, 0, 0);
  first.close();

  let busy = false;
  const timer = window.setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const res = await fetch(`${BRIDGE}/snapshot.jpg`, { cache: "no-store" });
      if (!res.ok) return;
      const bitmap = await createImageBitmap(await res.blob());
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    } catch {
      /* próximo quadro */
    } finally {
      busy = false;
    }
  }, 66);

  const stream = canvas.captureStream(15);
  const track = stream.getVideoTracks()[0];
  track?.addEventListener("ended", () => {
    window.clearInterval(timer);
    canvas.remove();
  });
  return stream;
}
