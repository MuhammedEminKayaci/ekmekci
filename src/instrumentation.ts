// Sunucu açılınca bir kez çalışır.
//  1) MSSQL bağlantı havuzunu önceden kurar: ilk kullanıcı bağlantı süresini beklemez.
//  2) KEEPALIVE_URL tanımlıysa (sunucuda web.config'den) 4 dakikada bir o adresi çağırır. İstek IIS'ten
//     geçtiği için uygulama havuzu "boşta" sayılmaz ve kapatılmaz; sabah ilk açılış da hızlı olur.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmUp } = await import("@/lib/db");
  warmUp().catch((err) => console.error("[açılış] veritabanı bağlantısı kurulamadı:", (err as Error).message));

  const url = process.env.KEEPALIVE_URL;
  if (url) {
    const ping = () => fetch(url, { cache: "no-store" }).catch(() => {});
    const timer = setInterval(ping, 4 * 60_000);
    timer.unref?.();
  }
}
