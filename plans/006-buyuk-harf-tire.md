# 006 — Büyük harfli etiketler ve uzun tire

## Problem
- ST-5 / C-11 (judgement): `expenses-view.tsx:139` "Türe göre", `:157` "Yere göre", `counter-view.tsx:149` fiş başlıkları `uppercase tracking-wide` ile büyük harfe zorlanıyor; projenin diğer bütün etiketleri cümle düzeninde.
- H-1 (dedektör): `expenses-view.tsx:464` "…'a ödeme — borcumuzdan düşülür, gider sayılmaz."

## Hedef
- Üç yerde `tracking-wide` ve `uppercase` kaldırılır (metin aynen kalır).
- `:464` → "…'a ödeme: borcumuzdan düşülür, gider sayılmaz."
