"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Başka bir kullanıcı (ya da başka bir cihaz) veri değiştirince açık sayfa kendini yeniler.
// Az veri harcasın diye: değişiklikler 0,8 sn toplanıp tek yenileme yapılır; sekme arka plandayken
// yenilenmez, öne gelince bir kez yenilenir. Bağlantı koparsa geri gelince yenilenir.
const TABLES = [
  "orders",
  "order_lines",
  "customers",
  "customer_prices",
  "customer_products",
  "products",
  "expenses",
  "driver_days",
  "counter_days",
  "drivers",
] as const;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function LiveRefresh() {
  const router = useRouter();
  const offline = useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    let lastRefresh = Date.now();

    const refresh = () => {
      dirty = false;
      lastRefresh = Date.now();
      router.refresh();
    };
    const schedule = () => {
      dirty = true;
      if (document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(refresh, 800);
    };

    const channel = supabase.channel("canli");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    let wasDown = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (wasDown) refresh();
        wasDown = false;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        wasDown = true;
      }
    });

    const onVisible = () => {
      if (document.hidden) return;
      // Öne gelince: değişiklik geldiyse ya da uzun süre arka plandaysa bir kez yenile.
      if (dirty || Date.now() - lastRefresh > 120_000) refresh();
    };
    const onOnline = () => refresh();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel);
    };
  }, [router]);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-debt px-4 py-2 text-[0.85rem] font-semibold text-white"
    >
      <WifiOff size={16} /> İnternet yok — bağlantı gelince sayfa kendiliğinden güncellenir. Bu arada yazılanlar kaydedilmeyebilir.
    </div>
  );
}
