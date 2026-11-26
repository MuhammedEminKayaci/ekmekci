import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { currentVersion, subscribe } from "@/lib/changes";

// Server-Sent Events: açık sayfaya "veri değişti" bildirimi.
//   event: surum  data: <veritabanı sürümü>   (bağlanınca bir kez, sonra her değişiklikte)
//   ": nabız" yorumu 20 sn'de bir (bağlantı ve IIS süreci canlı kalsın)
export async function GET(request: NextRequest) {
  if (verifyToken(request.cookies.get(SESSION_COOKIE)?.value) == null) {
    return new Response("Oturum yok", { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          open = false;
        }
      };

      send("retry: 3000\n\n");
      const unsubscribe = subscribe((v) => send(`event: surum\ndata: ${v}\n\n`));
      const heartbeat = setInterval(() => send(": nabiz\n\n"), 20_000);
      cleanup = () => {
        if (!open) return;
        open = false;
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", cleanup);
      send(`event: surum\ndata: ${await currentVersion()}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: sıkıştırma katmanları olayları tamponda bekletmesin.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
