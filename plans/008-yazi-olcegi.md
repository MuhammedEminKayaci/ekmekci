# 008 — Yazı ölçeği tokenları

**Bayrak:** REQUIRES-APPROVAL, TOUCHES-DS (`globals.css` `@theme`).

## Karar (Step 1'den önce, sahibin)
B-3: 268 yerde `text-[0.74rem]`, `text-[0.88rem]` … gibi keyfi boyutlar. İki meşru yol:
- **A — Tokenlaştır:** `@theme`'e 7–8 adımlık ölçek (`--text-caption: 0.75rem` … `--text-display: 2.6rem`) ekle, 268 kullanımı en yakın adıma eşle. Tutarlılık artar; bazı metinler 0.02–0.05 rem değişir (görsel fark).
- **B — Bırak:** mevcut rem değerleri tutarlı biçimde kullanılıyor ve görsel olarak onaylı; dokunma.

Bu plan onay gelene kadar uygulanmaz.

## Karar ve uygulama (2026-11-26)
Sahip **A — Tokenlaştır** yolunu seçti ("yazı boyutlarını eşitle").
- `globals.css` `@theme`: `--text-micro 0.625` · `caption 0.75` · `label 0.8` · `small 0.875` · `body 0.9375` · `input 1` · `lead 1.125` · `title 1.375` · `heading 1.625` · `display 2.125` · `headline 2.5` · `hero 2.875` · `mega 3.5` (rem).
- 52 farklı keyfi boyut (321 kullanım) en yakın adıma bağlandı; aynı adıma düşen gereksiz ekran kırılımı (`text-display sm:text-display`) temizlendi.
- `text-[#0a5a32]` (4) → yeni `--brand-strong` tokenı (`text-brand-strong`).
- Doğrulama: dedektör B-3 262 → 52 (kalanlar yazı boyutu değil: ızgara, yarıçap, harf aralığı); canlı CSS'te `--text-*` tokenları ve sınıfları var.
