"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { Empty, cx, inputClass } from "@/components/ui";
import { categoryColor } from "@/lib/colors";
import { money, qty } from "@/lib/format";
import { ProductMenu } from "./product-manage";

export type Sum = { qty: number; amount: number };
export type Category = { id: number; name: string; is_bread: boolean; color: string; count: number };
export type ProductRow = {
  id: number;
  name: string;
  unit: string;
  suggested_price: number | null;
  is_active: boolean;
  category_id: number;
  day: Sum;
  week: Sum;
  month: Sum;
  monthRoute: number;
  monthCounter: number;
  todayCustomers: number;
};

// Tablo: kolonlar arası dikey çizgi; Bugün / Bu hafta / Ay kolonları kendi renginde.
const GRID =
  "md:grid md:grid-cols-[minmax(11rem,1.6fr)_7.5rem_repeat(3,minmax(8rem,1fr))_minmax(6rem,0.75fr)_3rem] md:items-stretch";
const CELL = "md:flex md:items-center md:border-l md:border-line md:px-3";
const TONE = {
  day: "md:bg-brand-soft/45",
  week: "md:bg-sky-soft/60",
  month: "md:bg-violet-500/[0.07]",
} as const;
const HEAD_TONE = {
  day: "md:bg-brand-soft text-brand-deep dark:text-brand",
  week: "md:bg-sky-soft text-sky",
  month: "md:bg-violet-500/12 text-violet-700 dark:text-violet-300",
} as const;

const add = (a: Sum, b: Sum): Sum => ({ qty: a.qty + b.qty, amount: a.amount + b.amount });
const zero: Sum = { qty: 0, amount: 0 };

/** Ürün tablosu: türlere göre gruplu; arama ve tür filtresi. Ürün sayısı arttıkça sığar. */
export function ProductsTable({
  rows,
  categories,
  isAdmin,
  monthName,
}: {
  rows: ProductRow[];
  categories: Category[];
  isAdmin: boolean;
  monthName: string;
}) {
  const [cat, setCat] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [showPassive, setShowPassive] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return rows.filter(
      (r) =>
        (cat === "all" || r.category_id === cat) &&
        (!q || r.name.toLocaleLowerCase("tr").includes(q)) &&
        (showPassive || r.is_active || r.month.qty !== 0),
    );
  }, [rows, cat, query, showPassive]);

  const totals = visible.reduce(
    (a, r) => ({ day: add(a.day, r.day), week: add(a.week, r.week), month: add(a.month, r.month) }),
    { day: zero, week: zero, month: zero },
  );
  // Türe göre sıralı (türlerin sırası, sonra ürün sırası).
  const catIndex = new Map(categories.map((c, i) => [c.id, i]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const sorted = [...visible].sort((a, b) => (catIndex.get(a.category_id) ?? 99) - (catIndex.get(b.category_id) ?? 99));
  const passiveCount = rows.filter((r) => !r.is_active).length;

  return (
    <>
      {/* Seçili ürünlerin toplam tutarı */}
      <div className="mb-4 grid grid-cols-3 gap-3 sm:mb-5 sm:gap-5">
        {[
          { label: "Bugün", s: totals.day },
          { label: "Bu hafta", s: totals.week },
          { label: monthName, s: totals.month },
        ].map((x, i) => (
          <div key={x.label} className={cx("neu rounded-tile p-3.5 sm:p-5", i === 0 && "ring-2 ring-brand/30")}>
            <p className="text-caption font-semibold text-ink-3 sm:text-small">{x.label}</p>
            <p className="tnum mt-1 truncate font-display text-lead font-semibold sm:text-heading">
              <AnimatedNumber value={x.s.amount} />
            </p>
            <p className="tnum truncate text-caption text-ink-3 sm:text-label">{qty(x.s.qty)} satış</p>
          </div>
        ))}
      </div>

      <section className="neu rounded-tile">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="scroll-soft -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:pb-0" role="group" aria-label="Tür">
            {[{ id: "all" as const, name: "Hepsi", count: rows.length }, ...categories].map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={cat === c.id}
                onClick={() => setCat(c.id)}
                className={cx(
                  "min-h-10 shrink-0 rounded-full px-4 text-small font-semibold whitespace-nowrap transition-all duration-200",
                  cat === c.id ? "brand-fill" : "bg-bg-deep text-ink-2 hover:text-ink",
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  {"color" in c && cat !== c.id && <span className={cx("size-2 rounded-full", categoryColor(c.color).dot)} />}
                  {c.name} <span className="opacity-60">{c.count}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 lg:w-72 lg:flex-none">
              <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ürün ara"
                aria-label="Ürün ara"
                className={cx(inputClass, "pl-11")}
              />
            </div>
            {passiveCount > 0 && (
              <button
                type="button"
                aria-pressed={showPassive}
                onClick={() => setShowPassive((v) => !v)}
                className={cx(
                  "min-h-11 shrink-0 rounded-full px-3.5 text-label font-semibold",
                  showPassive ? "brand-fill" : "bg-bg-deep text-ink-2",
                )}
              >
                Pasifler
              </button>
            )}
          </div>
        </div>

        {sorted.length === 0 ? (
          <Empty title={rows.length === 0 ? "Henüz ürün yok" : "Sonuç yok"}>
            {rows.length === 0 ? "Yönetici “Yeni ürün” ile ekleyebilir." : "Aramayı ya da türü değiştirin."}
          </Empty>
        ) : (
          <>
            <div className={cx("hidden border-y border-line text-caption font-semibold text-ink-3", GRID)}>
              <span className="flex items-center px-6 py-2.5">Ürün</span>
              <span className={cx(CELL, "py-2.5")}>Tür</span>
              <span className={cx(CELL, HEAD_TONE.day, "justify-end py-2.5")}>Bugün</span>
              <span className={cx(CELL, HEAD_TONE.week, "justify-end py-2.5")}>Bu hafta</span>
              <span className={cx(CELL, HEAD_TONE.month, "justify-end py-2.5")}>{monthName}</span>
              <span className={cx(CELL, "justify-end py-2.5")}>Öneri fiyat</span>
              <span className={CELL} />
            </div>
            <ul className="flex flex-col gap-2 px-3 pb-3 sm:px-4 md:gap-0 md:px-0 md:pb-0">
              {sorted.map((r) => {
                const c = catById.get(r.category_id);
                const info = [
                  r.todayCustomers > 0 ? `Bugün ${r.todayCustomers} müşteri` : null,
                  r.monthRoute !== 0 || r.monthCounter !== 0
                    ? `${monthName}: dağıtım ${qty(r.monthRoute)}${r.monthCounter ? `, tezgah ${qty(r.monthCounter)}` : ""}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={r.id}
                    title={info || undefined}
                    className={cx(
                      "rounded-2xl bg-bg-deep/50 p-3 transition-colors md:rounded-none md:border-b md:border-line md:bg-transparent md:p-0 md:hover:bg-brand-soft/25",
                      GRID,
                      !r.is_active && "opacity-60",
                    )}
                  >
                    <div className="flex min-h-10 min-w-0 items-center gap-2 md:px-6">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{r.name}</span>
                        <span className="ml-1.5 text-caption text-ink-3">{r.unit}</span>
                        {!r.is_active && <span className="ml-2 rounded-full bg-bg-deep px-2 py-0.5 text-micro font-semibold text-ink-2">Pasif</span>}
                      </span>
                      {c && (
                        <span className="md:hidden">
                          <CategoryChip category={c} />
                        </span>
                      )}
                      {isAdmin && (
                        <span className="md:hidden">
                          <ProductMenu product={r} categories={categories} compact />
                        </span>
                      )}
                    </div>
                    <span className={cx("hidden", CELL)}>{c && <CategoryChip category={c} />}</span>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5 md:contents">
                      <Cell label="Bugün" s={r.day} tone="day" />
                      <Cell label="Bu hafta" s={r.week} tone="week" />
                      <Cell label={monthName} s={r.month} tone="month" />
                    </div>
                    <span className={cx("tnum hidden justify-end text-small text-ink-2", CELL)}>
                      {r.suggested_price != null ? money(r.suggested_price) : "—"}
                    </span>
                    <span className={cx("hidden justify-center", CELL, "md:px-0")}>
                      {isAdmin && <ProductMenu product={r} categories={categories} compact />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function Cell({ label, s, tone }: { label: string; s: Sum; tone: keyof typeof TONE }) {
  return (
    <div className={cx("min-w-0 rounded-lg bg-surface/70 px-2 py-1.5 md:justify-between md:gap-2 md:rounded-none md:py-1.5", CELL, TONE[tone])}>
      <p className="text-micro font-semibold text-ink-3 md:hidden">{label}</p>
      <span className="tnum hidden truncate text-caption text-ink-3 md:inline">{s.amount ? money(s.amount) : ""}</span>
      <p className={cx("tnum truncate text-input font-semibold md:text-right", s.qty === 0 && "text-ink-3")}>
        {s.qty === 0 ? "—" : qty(s.qty)}
      </p>
      <p className="tnum truncate text-caption text-ink-3 md:hidden">{s.amount ? money(s.amount) : ""}</p>
    </div>
  );
}

function CategoryChip({ category }: { category: Category }) {
  return (
    <span
      className={cx(
        "inline-flex w-[6.25rem] items-center justify-center gap-1.5 rounded-full px-2 py-1 text-caption leading-none font-semibold ring-1",
        categoryColor(category.color).chip,
      )}
      title={category.is_bread ? "Ekmek türü: tezgahta ek ürün olarak çıkmaz" : undefined}
    >
      <span className={cx("size-1.5 shrink-0 rounded-full", categoryColor(category.color).dot)} />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
