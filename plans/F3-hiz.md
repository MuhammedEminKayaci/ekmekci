# F3 — Hız

## Ölçüm (canlı, 2026-11-26)
İlk istek 2,6 sn (Next açılışı + MSSQL bağlantısı), sonrakiler 0,2–0,5 sn. Açılış animasyonları içerik görünür olduktan sonra ~1 sn daha oynuyordu (bkz. 001).

## Hedef
- `src/instrumentation.ts` `register()`: sunucu açılır açılmaz MSSQL havuzunu kur (ilk kullanıcı bağlantı süresini beklemesin).
- 001 ile açılış animasyonları kalkar (algılanan hız).
- F1'in SSE bağlantısı açık sayfa varken iisnode sürecini canlı tutar (IIS boşta kapatmaz).
- Sahibe not: Plesk → IIS Ayarları → uygulama havuzu "Boşta kalma zaman aşımı" 0 yapılırsa gece ilk açılış da hızlı olur (FTP ile değiştirilemez).

## Ek (2026-11-26): gece ilk açılış
- `/api/saglik` (oturumsuz, yalnız `SELECT 1`), `instrumentation.ts` sunucuda 4 dk'da bir `KEEPALIVE_URL`'i çağırır → IIS uygulama havuzu boşta sayılmaz, kapatılmaz.
- `web.config` `applicationInitialization doAppInitAfterRestart` → IIS geri dönüşümünde `/api/saglik` ile hemen ısıtılır. Canlıda kabul edildi (500 yok).
