"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";

// Anlık güncelleme: sunucu, veritabanında herhangi bir değişiklik olunca (başka kullanıcı ya da başka
// cihaz dahil) /api/canli üzerinden bildirir; açık sayfa kendini hemen yeniler.
// * Kullanıcı o an bir kutuya yazıyorsa yenileme kutudan çıkınca yapılır (yazdığı kaybolmaz).
// * Sekme arka plandaysa öne gelince yenilenir.
// * Bildirim bağlantısı koparsa tarayıcı kendisi yeniden bağlanır; ayrıca 60 sn'lik yedek yenileme var.
const FALLBACK = 60_000;
const DEBOUNCE = 250;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function typing() {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

export function LiveRefresh() {
  const router = useRouter();
  const offline = useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );

  useEffect(() => {
    let pending = false;
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let known: string | null = null;

    const refreshNow = () => {
      if (document.hidden || typing()) {
        pending = true;
        return;
      }
      pending = false;
      last = Date.now();
      router.refresh();
    };
    const schedule = () => {
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(refreshNow, DEBOUNCE);
    };

    // Anlık bildirim
    const es = new EventSource("/api/canli");
    es.addEventListener("surum", (e) => {
      const v = (e as MessageEvent<string>).data;
      if (known === null) known = v; // ilk mesaj: taban sürüm
      else if (v !== known) {
        known = v;
        schedule();
      }
    });
    es.addEventListener("open", () => {
      // Kopukluktan dönüş: aradaki değişiklikler kaçmış olabilir.
      if (known !== null) schedule();
    });

    // Yazma bittiğinde, sekme öne geldiğinde, bağlantı döndüğünde bekleyen yenilemeyi yap.
    const onFocusOut = () => setTimeout(() => pending && !typing() && refreshNow(), 50);
    const onVisible = () => !document.hidden && (pending || Date.now() - last > FALLBACK) && refreshNow();
    const onOnline = () => refreshNow();
    const fallback = setInterval(() => {
      if (es.readyState !== EventSource.OPEN && Date.now() - last > FALLBACK) refreshNow();
    }, 10_000);

    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      es.close();
      clearTimeout(timer);
      clearInterval(fallback);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-debt px-4 py-2 text-small font-semibold text-white"
    >
      <WifiOff size={16} /> İnternet yok. Bağlantı gelince sayfa kendiliğinden güncellenir; bu arada yazılanlar kaydedilmeyebilir.
    </div>
  );
}
