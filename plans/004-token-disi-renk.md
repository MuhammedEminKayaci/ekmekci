# 004 — Token dışı mavi

## Problem
B-2. `expenses-view.tsx:253` `bg-sky-500/12 text-sky-700 dark:text-sky-300` ve `:462` `bg-sky-500/10` — projede `--sky` / `--sky-soft` tokenları var.

## Hedef
`:253` → `bg-sky-soft text-sky`; `:462` → `bg-sky-soft`.

## Doğrulama
`grep -n "sky-[0-9]" src/app/(app)/giderler/expenses-view.tsx` → boş.
