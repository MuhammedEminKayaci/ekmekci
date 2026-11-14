import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarDays, Package } from "lucide-react";
import { Empty, IconChip, PageHeader, Skeleton, Tile, TileTitle, cx, order } from "@/components/ui";
import { addDays, money, monthLabel, monthStart, qty, shortDate, todayTR, weekStart, weekdayShort } from "@/lib/format";
import { getSessionProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NewProductButton, ProductMenu } from "./product-manage";

export const metadata: Metadata = { title: "Ürünler" };

type Sum = { delivered: number; returned: number; amount: number };
const empty = (): Sum => ({ delivered: 0, returned: 0, amount: 0 });

async function Products() {
  const supabase = await createClient();
  const today = todayTR();
  const week = weekStart(today);
  const month = monthStart(today);
  const from = week < month ? week : month;

  const [{ data: products }, { data: daily }, profile] = await Promise.all([
    supabase.from("products").select("id, name, unit, suggested_price, is_active, sort_order").order("sort_order").order("id"),
    supabase.rpc("get_product_daily", { p_from: from, p_to: today }),
    getSessionProfile(),
  ]);

  const list = products ?? [];
  const rows = daily ?? [];
  const stats = new Map<number, { day: Sum; week: Sum; month: Sum; todayCustomers: number }>();
  for (const p of list) stats.set(p.id, { day: empty(), week: empty(), month: empty(), todayCustomers: 0 });
  for (const r of rows) {
    const s = stats.get(r.product_id);
    if (!s) continue;
    const add = (t: Sum) => {
      t.delivered += Number(r.delivered_qty);
      t.returned += Number(r.returned_qty);
      t.amount += Number(r.net_amount);
    };
    if (r.entry_date === today) {
      add(s.day);
      s.todayCustomers = Number(r.customers);
    }
    if (r.entry_date >= week) add(s.week);
    if (r.entry_date >= month) add(s.month);
  }

  // Bu ayın günleri: gün × ürün net adet.
  const shown = list.filter((p) => p.is_active || (stats.get(p.id)?.month.delivered ?? 0) > 0);
  const days: string[] = [];
  for (let d = today; d >= month; d = addDays(d, -1)) days.push(d);
  const cell = new Map(rows.map((r) => [`${r.entry_date}|${r.product_id}`, r]));
  const isAdmin = profile?.isAdmin ?? false;

  return (
    <>
      <PageHeader
        title="Ürünler"
        description="Sattığınız ürünler ve her birinden bugün, bu hafta ve bu ay kaç adet satıldığı. Fiyatlar müşteriye özeldir; burada yazan fiyat yalnızca öneridir."
        actions={isAdmin ? <NewProductButton /> : undefined}
      />

      {shown.length === 0 ? (
        <Empty title="Henüz ürün yok">Yönetici “Yeni ürün” ile ekleyebilir.</Empty>
      ) : (
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((p, i) => {
            const s = stats.get(p.id)!;
            return (
              <Tile key={p.id} i={Math.min(i + 1, 8)}>
                <TileTitle
                  icon={<IconChip icon={Package} tone={p.is_active ? "brand" : "sky"} size="sm" />}
                  aside={isAdmin ? <ProductMenu product={{ id: p.id, name: p.name, unit: p.unit, suggested_price: p.suggested_price == null ? null : Number(p.suggested_price), is_active: p.is_active }} /> : undefined}
                >
                  <span className="truncate">{p.name}</span>
                  {!p.is_active && <span className="rounded-full bg-bg-deep px-2 py-0.5 text-[0.7rem] font-semibold text-ink-2">Pasif</span>}
                </TileTitle>
                <div className="grid grid-cols-3 gap-2.5">
                  <Period label="Bugün" sum={s.day} unit={p.unit} highlight />
                  <Period label="Bu hafta" sum={s.week} unit={p.unit} />
                  <Period label={monthLabel(month).split(" ")[0]} sum={s.month} unit={p.unit} />
                </div>
                <p className="mt-3 text-[0.8rem] text-ink-3">
                  {s.todayCustomers ? `Bugün ${s.todayCustomers} müşteriye gitti` : "Bugün henüz satış yok"}
                  {p.suggested_price != null && ` · öneri fiyat ${money(Number(p.suggested_price))}`}
                </p>
              </Tile>
            );
          })}
        </div>
      )}

      {shown.length > 0 && (
        <section style={order(9)} className="neu animate-rise mt-5 rounded-tile">
          <div className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 font-display text-[1.15rem] font-semibold tracking-tight">
              <IconChip icon={CalendarDays} tone="brand" size="sm" /> {monthLabel(month)} — günlük satış
            </h2>
            <p className="text-[0.85rem] text-ink-3">Net adet (verilen − iade) · en yeni üstte</p>
          </div>
          <div className="overflow-x-auto pb-2">
            <table className="tnum w-full min-w-max text-[0.9rem]">
              <thead>
                <tr className="border-y border-line text-[0.78rem] font-semibold text-ink-3">
                  <th className="px-5 py-2.5 text-left font-semibold sm:px-6">Gün</th>
                  {shown.map((p) => (
                    <th key={p.id} className="px-4 py-2.5 text-right font-semibold">{p.name}</th>
                  ))}
                  <th className="px-5 py-2.5 text-right font-semibold sm:px-6">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  let amount = 0;
                  return (
                    <tr key={d} className={cx("border-b border-line", d === today && "bg-brand-soft/40")}>
                      <td className="px-5 py-2.5 font-semibold whitespace-nowrap sm:px-6">
                        {shortDate(d)} <span className="font-normal text-ink-3">{weekdayShort(d)}</span>
                      </td>
                      {shown.map((p) => {
                        const r = cell.get(`${d}|${p.id}`);
                        if (r) amount += Number(r.net_amount);
                        const n = r ? Number(r.delivered_qty) - Number(r.returned_qty) : 0;
                        return (
                          <td key={p.id} className={cx("px-4 py-2.5 text-right", n === 0 && "text-ink-3")}>
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

function Period({ label, sum, unit, highlight }: { label: string; sum: Sum; unit: string; highlight?: boolean }) {
  const net = sum.delivered - sum.returned;
  return (
    <div className={cx("min-w-0 rounded-xl px-3 py-2.5", highlight ? "bg-brand-soft ring-1 ring-brand/30" : "bg-bg-deep/60")}>
      <p className="truncate text-[0.74rem] font-semibold text-ink-3">{label}</p>
      <p className="tnum truncate font-display text-[1.45rem] leading-tight font-semibold">{qty(net)}</p>
      <p className="truncate text-[0.72rem] text-ink-3">{unit} net</p>
      <p className="tnum mt-1 truncate text-[0.76rem] text-ink-2">
        {qty(sum.delivered)} verildi{sum.returned ? ` · ${qty(sum.returned)} iade` : ""}
      </p>
      <p className="tnum truncate text-[0.8rem] font-semibold">{money(sum.amount)}</p>
    </div>
  );
}

function ProductsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-12 w-60" />
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-52 rounded-tile" />
        ))}
      </div>
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
