# 002 — Basma geri bildirimi tam 0.96

**Bayrak:** TOUCHES-DS (`ui.tsx` `buttonClass`).

## Problem
KR-10. `ui.tsx:200` `active:scale-[0.97]`; `nav.tsx:98` `active:scale-95`; `page.tsx:253` `active:scale-[0.97]`. Üç farklı değer.

## Hedef
Üçü de `active:scale-[0.96]`. Kaynak `buttonClass`'ta; diğer ikisi aynı değere.

## Adımlar
1. `buttonClass`: `active:scale-[0.97]` → `active:scale-[0.96]`.
2. `nav.tsx`: `active:scale-95` → `active:scale-[0.96]`.
3. `page.tsx` "Bugünün siparişlerini gir" bağlantısı: aynı.

## Doğrulama
`grep -rn "active:scale" src` → yalnız `0.96`.
