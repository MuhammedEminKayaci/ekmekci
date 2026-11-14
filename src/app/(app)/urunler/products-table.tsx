"use client";

import { useMemo, useState } from "react";
import { Package, Search } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { Empty, cx, inputClass, order } from "@/components/ui";
import { money, qty } from "@/lib/format";
import { ProductMenu } from "./product-manage";

export type Sum = { qty: number; amount: number };
export type Category = { id: number; name: string; is_bread: boolean; count: number };
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

const GRID =
  "md:grid md:grid-cols-[minmax(11rem,1.6fr)_repeat(3,minmax(7.5rem,1fr))_minmax(6.5rem,0.8fr)_2.75rem] md:items-center md:gap-4";

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
  const groups = categories
    .map((c) => ({ cat: c, items: visible.filter((r) => r.category_id === c.id) }))
    .filter((g) => g.items.length > 0);
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
          <div key={x.label} style={order(i + 1)} className={cx("neu animate-rise rounded-tile p-3.5 sm:p-5", i === 0 && "ring-2 ring-brand/30")}>
            <p className="text-[0.74rem] font-semibold text-ink-3 sm:text-[0.85rem]">{x.label}</p>
            <p className="tnum mt-1 truncate font-display text-[1.15rem] font-semibold sm:text-[1.7rem]">
              <AnimatedNumber value={x.s.amount} />
            </p>
            <p className="tnum truncate text-[0.72rem] text-ink-3 sm:text-[0.8rem]">{qty(x.s.qty)} satış</p>
          </div>
        ))}
      </div>

      <section style={order(4)} className="neu animate-rise rounded-tile">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="scroll-soft -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:pb-0" role="group" aria-label="Tür">
            {[{ id: "all" as const, name: "Hepsi", count: rows.length }, ...categories].map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={cat === c.id}
                onClick={() => setCat(c.id)}
                className={cx(
                  "min-h-10 shrink-0 rounded-full px-4 text-[0.85rem] font-semibold whitespace-nowrap transition-all duration-200",
                  cat === c.id ? "brand-fill" : "bg-bg-deep text-ink-2 hover:text-ink",
                )}
              >
                {c.name} <span className="opacity-60">{c.count}</span>
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
                  "min-h-11 shrink-0 rounded-full px-3.5 text-[0.82rem] font-semibold",
                  showPassive ? "brand-fill" : "bg-bg-deep text-ink-2",
                )}
              >
                Pasifler
              </button>
            )}
          </div>
        </div>

        {groups.length === 0 ? (
          <Empty title={rows.length === 0 ? "Henüz ürün yok" : "Sonuç yok"}>
            {rows.length === 0 ? "Yönetici “Yeni ürün” ile ekleyebilir." : "Aramayı ya da türü değiştirin."}
          </Empty>
        ) : (
          <>
            <div className={cx("hidden border-y border-line px-6 py-3 text-[0.78rem] font-semibold text-ink-3", GRID)}>
              <span>Ürün</span>
              <span className="text-right">Bugün</span>
              <span className="text-right">Bu hafta</span>
              <span className="text-right">{monthName}</span>
              <span className="text-right">Öneri fiyat</span>
              <span />
            </div>
            {groups.map((g) => {
              const sub = g.items.reduce(
                (a, r) => ({ day: add(a.day, r.day), week: add(a.week, r.week), month: add(a.month, r.month) }),
                { day: zero, week: zero, month: zero },
              );
              return (
                <div key={g.cat.id}>
                  <div className={cx("flex items-center justify-between gap-3 bg-bg-deep/70 px-4 py-2 text-[0.8rem] font-semibold sm:px-6", GRID)}>
                    <span className="flex items-center gap-2 text-ink">
                      {g.cat.name}
                      {g.cat.is_bread && <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[0.68rem] text-amber">ekmek türü</span>}
                      <span className="font-medium text-ink-3">{g.items.length} ürün</span>
                    </span>
                    <span className="tnum hidden text-right text-ink-2 md:block">{money(sub.day.amount)}</span>
                    <span className="tnum hidden text-right text-ink-2 md:block">{money(sub.week.amount)}</span>
                    <span className="tnum text-right text-ink-2">{money(sub.month.amount)}</span>
                    <span className="hidden md:block" />
                    <span className="hidden md:block" />
                  </div>
                  <ul>
                    {g.items.map((r) => (
                      <li
                        key={r.id}
                        className={cx("border-b border-line px-4 py-3 transition-colors sm:px-6 md:hover:bg-brand-soft/30", GRID, !r.is_active && "opacity-60")}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="hidden size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-deep sm:grid dark:text-brand">
                            <Package size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-semibold">{r.name}</span>
                              {!r.is_active && <span className="rounded-full bg-bg-deep px-2 py-0.5 text-[0.68rem] font-semibold text-ink-2">Pasif</span>}
                            </span>
                            <span className="tnum block truncate text-[0.76rem] text-ink-3">
                              {r.unit}
                              {r.todayCustomers > 0 && ` · bugün ${r.todayCustomers} müşteri`}
                              {(r.monthRoute !== 0 || r.monthCounter !== 0) &&
                                ` · ay: dağıtım ${qty(r.monthRoute)}${r.monthCounter ? `, tezgah ${qty(r.monthCounter)}` : ""}`}
                            </span>
                          </span>
                          {isAdmin && (
                            <span className="md:hidden">
                              <ProductMenu product={r} categories={categories} compact />
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 grid grid-cols-3 gap-2 md:contents">
                          <Cell label="Bugün" s={r.day} unit={r.unit} strong />
                          <Cell label="Bu hafta" s={r.week} unit={r.unit} />
                          <Cell label={monthName} s={r.month} unit={r.unit} />
                        </div>
                        <span className="tnum hidden text-right text-[0.9rem] text-ink-2 md:block">
                          {r.suggested_price != null ? money(r.suggested_price) : "—"}
                        </span>
                        <span className="hidden justify-end md:flex">
                          {isAdmin && <ProductMenu product={r} categories={categories} compact />}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        )}
      </section>
    </>
  );
}

function Cell({ label, s, unit, strong }: { label: string; s: Sum; unit: string; strong?: boolean }) {
  return (
    <div className={cx("min-w-0 rounded-xl bg-bg-deep/60 px-2.5 py-2 text-right md:bg-transparent md:p-0", strong && "md:font-semibold")}>
      <p className="text-left text-[0.68rem] font-semibold text-ink-3 md:sr-only">{label}</p>
      <p className={cx("tnum truncate text-[1rem] font-semibold", s.qty === 0 && "text-ink-3")}>
        {s.qty === 0 ? "—" : qty(s.qty)}
        {s.qty !== 0 && <span className="ml-1 text-[0.72rem] font-medium text-ink-3">{unit}</span>}
      </p>
      <p className="tnum truncate text-[0.74rem] text-ink-3">{s.amount ? money(s.amount) : ""}</p>
    </div>
  );
}
