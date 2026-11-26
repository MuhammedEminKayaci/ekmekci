# F2 — Kayıt edilememe sorunları

## Problem (kodda doğrulandı)
1. `week-board.tsx` `LineRow.commit()` ve `OrderRow.commitCollection()` kaydedilecek değeri kutunun kendi metninden değil, üst bileşenin `rows` durumundan okuyor. Sunucudan yenileme geldiğinde `rows` sunucu değerine sıfırlanıyor (`if (serverRows !== lastServerRows) setRows(serverRows)`); kullanıcının yazdığı ama henüz kaydedilmemiş değer ekranda kalıyor, kutudan çıkınca `commit` "değişiklik yok" sanıp **kaydetmiyor**.
2. Başka cihazdan değişen adet/tahsilat kutulara yansımıyor (kutu metni yalnız ilk açılışta dolduruluyor) — anlık güncellemeyle birlikte eski değer ekranda kalır, üstüne yazılırsa diğer kullanıcının girişi ezilir.
3. Aynı satırda hızlı iki giriş: iki istek yarışır, eski yanıt yenisinin üstüne "kaydedildi" durumu yazabilir.
4. Kayıt başarısızsa kutu eski değere dönmüyor ve kullanıcı kaydın gitmediğini yalnız kısa bir bildirimden anlıyor.

## Hedef
- Kaydedilecek değer kutunun kendi metninden hesaplanır; karşılaştırma son başarılı kayıtla.
- Kutu odakta değilse ve bekleyen düzenleme yoksa sunucudan gelen yeni değer kutuya yazılır.
- Satır başına istekler sırayla gider (tek kuyruk).
- Başarısız kayıtta kutu kırmızı çerçeveyle "kaydedilmedi" kalır; bir sonraki çıkışta yeniden dener.
- Tahsilat, tezgah ekmek parası ve şoför teslim kutularına aynı kural.
