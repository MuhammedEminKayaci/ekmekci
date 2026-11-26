# F1 — Her sayfa anlık güncellensin

## Problem
Şu an başka cihazda yapılan değişiklik açık sayfaya ancak 30 sn'lik yoklamayla düşüyor; sayfa sıra değişimi gibi bazı değişiklikleri hiç fark etmiyor.

## Hedef
- **Veritabanı:** SQL Server Change Tracking (veritabanında ve 16 veri tablosunda). `CHANGE_TRACKING_CURRENT_VERSION()` her yazımda artan, tek satırlık ucuz bir sürüm numarası verir — sıra değişimi dahil her değişikliği yakalar.
- **Sunucu:** `src/lib/changes.ts` — açık bağlantı varken saniyede bir sürümü okuyan TEK paylaşılan döngü (kaç kişi bağlı olursa olsun tek sorgu). `src/app/api/canli/route.ts` — Server-Sent Events: bağlanınca güncel sürüm, değişince `degisti` olayı, 20 sn'de bir kalp atışı. Oturum çerezi zorunlu.
- **İstemci:** `live-refresh.tsx` — `EventSource('/api/canli')`; sürüm değişince 250 ms içinde `router.refresh()`. Kullanıcı o an bir kutuya yazıyorsa yenileme odaktan çıkınca yapılır. SSE koparsa tarayıcı kendisi yeniden bağlanır; ayrıca 60 sn'lik yedek yoklama.
- **IIS:** `/api/canli` için yanıt sıkıştırma kapalı (`web.config` `<location>`), aksi halde olaylar tamponda bekler.

## Doğrulama
İki ayrı bağlantıdan: birinde SSE dinlenirken diğerinde procedure ile yazma → olay < 2 sn içinde gelir (yerelde ve canlıda).
