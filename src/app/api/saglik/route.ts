import { query } from "@/lib/db";

// Hafif sağlık kontrolü: uygulama ve veritabanı ayakta mı. Oturum gerektirmez, veri döndürmez.
// IIS'in uygulamayı boşta kapatmaması (sabah ilk açılış hızlı olsun) ve yeniden başlatmada ısıtma için.
export async function GET() {
  try {
    await query("SELECT 1 AS ok");
    return new Response("ok", { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response("veritabanı yok", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
