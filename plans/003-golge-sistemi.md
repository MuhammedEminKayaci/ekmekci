# 003 — Gölgeler yalnız gerçek katmanlarda, tek token

**Bayrak:** TOUCHES-DS (`globals.css` yeni `--shadow-pop` + `shadow-pop` utility).

## Problem
DEC-4 / KR-5 / E-8. Akış içi bölümlerde süs gölgeleri ve katmanlarda her biri farklı elle yazılmış gölgeler:
- Akış içi (gölge gereksiz): `expenses-view.tsx:121` `shadow-[0_24px_48px_-24px_rgba(120,20,20,0.4)]`, `counter-view.tsx:134` `shadow-[0_24px_48px_-24px_rgba(8,60,32,0.45)]`, `layout.tsx:64` yan panel `shadow-[0_24px_48px_-20px_rgba(8,60,32,0.55)]`, `page.tsx:253` beyaz bağlantı `shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)]`.
- Gerçek katman (gölge gerekli, tek kaynaktan): `week-board.tsx:764` ürün ekle menüsü, `combobox.tsx:119` öneri listesi, `sheet.tsx:37` alt pencere.

## Hedef
- `:root` ve koyu tema: `--shadow-pop: 0 18px 40px -16px rgba(16,36,26,0.35)` / koyu `0 18px 40px -16px rgba(0,0,0,0.6)`; `@utility shadow-pop { box-shadow: var(--shadow-pop) }`.
- Üç katman `shadow-pop` kullanır; akış içi dört gölge silinir. `nav.tsx` aktif menü öğesi gölgesi (durum) → gölge yerine mevcut beyaz dolgu yeterli; sil.

## Kapsam dışı
`neu`, `neu-sm`, `neu-inset` yüzey sistemi (projenin bilinçli yüzey dili).

## Doğrulama
`grep -rn "shadow-\[" src` → yalnız `inputClass` odak halkası (durum) kalır.
