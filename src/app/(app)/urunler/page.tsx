import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarDays } from "lucide-react";
import { IconChip, PageHeader, Skeleton, cx } from "@/components/ui";
import { addDays, money, monthLabel, monthStart, qty, shortDate, todayTR, weekStart, weekdayShort } from "@/lib/format";
import { day, isoDay, num, proc, query, type Row } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { CategoriesButton, NewProductButton } from "./product-manage";
import { ProductsTable, type Category, type ProductRow, type Sum } from "./products-table";

export const metadata: Metadata = { title: "Ürünler" };

const empty = (): Sum => ({ qty: 0, amount: 0 });

async function Products() {
  const profile = await requireUser();
  const today = todayTR();
  const week = weekStart(today);
  const month = monthStart(today);
  const from = week < month ? week : month;

  const [categoryRows, productRows, daily] = await Promise.all([
    query<Row>(
      `SELECT c.CategoryId, c.Name, c.IsBread, Color = k.Code, c.SortOrder
         FROM dbo.ProductCategories c JOIN dbo.Colors k ON k.ColorId = c.ColorId ORDER BY c.SortOrder, c.CategoryId`,
    ),
    query<Row>(`SELECT ProductId, Name, Unit, SuggestedPrice, IsActive, SortOrder, CategoryId FROM dbo.Products ORDER BY SortOrder, ProductId`),
    proc("dbo.sp_Report_ProductDaily", { From: day(from), To: day(today) }),
  ]);
  const categories = categoryRows.map((c) => ({ id: c.CategoryId as number, name: c.Name as string, is_bread: c.IsBread as boolean, color: c.Color as string }));
  const products = productRows.map((p) => ({
    id: p.ProductId as number, name: p.Name as string, unit: p.Unit as string,
    suggested_price: p.SuggestedPrice == null ? null : num(p.SuggestedPrice),
    is_active: p.IsActive as boolean, sort_order: p.SortOrder as number, category_id: p.CategoryId as number,
  }));
  // Dağıtım (verilen − iade) ve tezgah satışları ürün + gün bazında tek sonuçta gelir.
  const dailyRows = daily.sets[0] as Row[];
  const route = dailyRows
    .filter((r) => num(r.RouteQty) !== 0 || num(r.RouteAmount) !== 0 || num(r.Customers) > 0)
    .map((r) => ({ entry_date: isoDay(r.EntryDate)!, product_id: r.ProductId as number, delivered_qty: num(r.RouteQty), returned_qty: 0, net_amount: num(r.RouteAmount), customers: num(r.Customers) }));
  const counter = dailyRows
    .filter((r) => num(r.CounterQty) !== 0)
    .map((r) => ({ entry_date: isoDay(r.EntryDate)!, product_id: r.ProductId as number, qty: num(r.CounterQty), amount: num(r.CounterAmount) }));

  // Ürün başına: dağıtım (verilen − iade) + tezgah satışı.
  type Acc = { day: Sum; week: Sum; month: Sum; monthRoute: number; monthCounter: number; todayCustomers: number };
  const stats = new Map<number, Acc>();
  const get = (id: number) => {
    let s = stats.get(id);
    if (!s) stats.set(id, (s = { day: empty(), week: empty(), month: empty(), monthRoute: 0, monthCounter: 0, todayCustomers: 0 }));
    return s;
  };
  const add = (s: Acc, date: string, q: number, amount: number) => {
    const put = (t: Sum) => {
      t.qty += q;
      t.amount += amount;
    };
    if (date === today) put(s.day);
    if (date >= week) put(s.week);
    if (date >= month) put(s.month);
  };
  // Günlük tablo: gün × tür.
  const byDay = new Map<string, Map<number, number>>();
  const dayAmount = new Map<string, number>();
  const catOf = new Map((products ?? []).map((p) => [p.id, p.category_id]));
  const addDay = (date: string, productId: number, q: number, amount: number) => {
    if (date < month) return;
    const cat = catOf.get(productId);
    if (cat == null) return;
    const m = byDay.get(date) ?? new Map<number, number>();
    m.set(cat, (m.get(cat) ?? 0) + q);
    byDay.set(date, m);
    dayAmount.set(date, (dayAmount.get(date) ?? 0) + amount);
  };

  for (const r of route ?? []) {
    const q = Number(r.delivered_qty) - Number(r.returned_qty);
    const s = get(r.product_id);
    add(s, r.entry_date, q, Number(r.net_amount));
    if (r.entry_date >= month) s.monthRoute += q;
    if (r.entry_date === today) s.todayCustomers = Number(r.customers);
    addDay(r.entry_date, r.product_id, q, Number(r.net_amount));
  }
  for (const c of counter ?? []) {
    if (c.product_id == null) continue;
    const s = get(c.product_id);
    add(s, c.entry_date, Number(c.qty), Number(c.amount));
    if (c.entry_date >= month) s.monthCounter += Number(c.qty);
    addDay(c.entry_date, c.product_id, Number(c.qty), Number(c.amount));
  }

  const rows: ProductRow[] = (products ?? []).map((p) => {
    const s = get(p.id);
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      suggested_price: p.suggested_price == null ? null : Number(p.suggested_price),
      is_active: p.is_active,
      category_id: p.category_id,
      day: s.day,
      week: s.week,
      month: s.month,
      monthRoute: s.monthRoute,
      monthCounter: s.monthCounter,
      todayCustomers: s.todayCustomers,
    };
  });
  const cats: Category[] = (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    is_bread: c.is_bread,
    color: c.color,
    count: rows.filter((r) => r.category_id === c.id).length,
  }));

  const usedCats = cats.filter((c) => rows.some((r) => r.category_id === c.id && (r.is_active || r.month.qty !== 0)));
  const days: string[] = [];
  for (let d = today; d >= month; d = addDays(d, -1)) days.push(d);
  const isAdmin = profile?.isAdmin ?? false;

  return (
    <>
      <PageHeader
        title="Ürünler"
        description="Ürünler türlerine göre; her birinden bugün, bu hafta ve bu ay kaç tane satıldığı. Dağıtım (verilen − iade) ve tezgah satışları birlikte sayılır."
        actions={
          isAdmin ? (
            <div className="grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto">
              <CategoriesButton categories={cats} />
              <NewProductButton categories={cats} />
            </div>
          ) : undefined
        }
      />

      <ProductsTable rows={rows} categories={cats} isAdmin={isAdmin} monthName={monthLabel(month).split(" ")[0]} />

      {usedCats.length > 0 && (
        <section className="neu mt-5 rounded-tile">
          <div className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 font-display text-lead font-semibold tracking-tight">
              <IconChip icon={CalendarDays} tone="brand" size="sm" /> {monthLabel(month)} — günlük satış
            </h2>
            <p className="text-small text-ink-3">Türe göre net adet (dağıtım + tezgah) · en yeni üstte</p>
          </div>
          <div className="scroll-soft max-h-[30rem] overflow-auto pb-2">
            <table className="tnum w-full min-w-max text-small">
              <thead>
                <tr className="sticky top-0 z-10 border-y border-line bg-surface text-label font-semibold text-ink-3">
                  <th className="px-5 py-2.5 text-left font-semibold sm:px-6">Gün</th>
                  {usedCats.map((c) => (
                    <th key={c.id} className="px-4 py-2.5 text-right font-semibold">
                      {c.name}
                    </th>
                  ))}
                  <th className="px-5 py-2.5 text-right font-semibold sm:px-6">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const m = byDay.get(d);
                  const amount = dayAmount.get(d) ?? 0;
                  return (
                    <tr key={d} className={cx("border-b border-line", d === today && "bg-brand-soft/40")}>
                      <td className="px-5 py-2.5 font-semibold whitespace-nowrap sm:px-6">
                        {shortDate(d)} <span className="font-normal text-ink-3">{weekdayShort(d)}</span>
                      </td>
                      {usedCats.map((c) => {
                        const n = m?.get(c.id) ?? 0;
                        return (
                          <td key={c.id} className={cx("px-4 py-2.5 text-right", n === 0 && "text-ink-3")}>
                            {n === 0 ? "—" : qty(n)}
                          </td>
                        );
                      })}
                      <td className="px-5 py-2.5 text-right font-semibold sm:px-6">{amount ? money(amount) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function ProductsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-12 w-60" />
      <Skeleton className="h-28 rounded-tile" />
      <Skeleton className="h-96 rounded-tile" />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductsSkeleton />}>
      <Products />
    </Suspense>
  );
}
