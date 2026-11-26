# 001 — İlk açılış animasyonlarını kaldır, süreleri kısalt

**Bayrak:** TOUCHES-DS (`src/app/globals.css` animasyon utility'leri, `src/components/ui.tsx` `order` / `Tile`, `src/components/animated-number.tsx`). REQUIRES-APPROVAL değil.

## Problem
- KR-15 (No animation on first render), G-5 (>300 ms), G-6 (genişlik animasyonu). Dedektör: `globals.css:267` `animate-rise 520ms` + `--i * 55ms` gecikme; `:281` `animate-grow 700ms`; `:287` `animate-draw 1300ms 200ms`; `:291` `animate-gauge 1200ms 250ms`; `page.tsx:353` `transition-[width] duration-700`.
- `animated-number.tsx`: `useState(0)` → her sayı açılışta 0'dan 900 ms sayıyor; her otomatik yenilemede de 900 ms.
- Sonuç: her sayfa açılışında içerik ~1 sn boyunca kayarak/sayarak geliyor; panel yavaş hissediyor.

## Hedef
- `animate-rise`, `animate-fade`, `animate-grow`, `animate-draw`, `animate-gauge` ve onları besleyen `order()` / `--i` kademesi **tamamen kalkar** (US-010: her kullanım).
- Etkileşim geri bildirimi kalır ama kısalır: `animate-pop` 360→180 ms, `animate-toast` 380→220 ms, `dialog` açılışı 460/360→240 ms, arka plan 300→180 ms, `lift` 260→180 ms.
- `AnimatedNumber`: ilk çizimde son değer; yalnız değer değişince 280 ms.

## Adımlar
1. `globals.css`: yukarıdaki beş utility'yi ve yalnız onların kullandığı `rise`, `fade`, `grow-y`, `draw`, `gauge` keyframe'lerini sil (`fade` dialog arka planında kullanılıyorsa kalır).
2. `ui.tsx`: `order()` ve `Tile`'ın `i` prop'unu kaldır; `Tile` sınıfından `animate-rise` çıkar.
3. Bütün `.tsx`'te: `animate-rise|animate-fade|animate-grow|animate-draw|animate-gauge` sınıflarını, `style={order(…)}` özelliklerini, `i={…}` Tile prop'larını, `order` importlarını kaldır.
4. `page.tsx:353` `transition-[width] duration-700` kaldır.
5. `animated-number.tsx` hedefteki gibi.

## Kapsam dışı
Renkler, yerleşim, metin. `animate-pop` kullanılan yerlerin kendisi (onay işaretleri, menüler).

## Doğrulama
`grep -rn "animate-rise\|order(" src` → yalnız `sort_order/reorder`; `tsc`, `lint` temiz; sayfalar 200; ekranda açılışta kayma yok.
