import type { Metadata } from "next";
import { Suspense } from "react";
import { DayNav } from "@/components/day-nav";
import { PageHeader, Skeleton } from "@/components/ui";
import { addDays, isISODate, todayTR } from "@/lib/format";
import { day as dbDay, num, query, type Row } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { CounterView } from "./counter-view";

export const metadata: Metadata = { title: "Tezgah" };

type Search = Promise<{ gun?: string }>;

async function Counter({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  await requireUser();
  const today = todayTR();
  const day = isISODate(sp.gun) ? sp.gun : today;

  const [head, salesRows, recentRows, productRows, categoryRows] = await Promise.all([
    query<Row>(
      `SELECT Bread = ISNULL((SELECT SalesIncome FROM dbo.CounterDays WHERE EntryDate = @D), 0), Locked = dbo.fn_IsLocked(@D)`,
      { D: dbDay(day) },
    ),
    query<Row>(
      `SELECT CounterSaleId, Name, Qty, UnitPrice, Amount FROM dbo.CounterSales WHERE EntryDate = @D ORDER BY CreatedAt, CounterSaleId`,
      { D: dbDay(day) },
    ),
    query<Row>(
      `SELECT TOP (400) Name, UnitPrice FROM dbo.CounterSales WHERE EntryDate >= @From ORDER BY EntryDate DESC, CounterSaleId DESC`,
      { From: dbDay(addDays(today, -120)) },
    ),
    query<Row>(`SELECT Name, SuggestedPrice, CategoryId FROM dbo.Products WHERE IsActive = 1 ORDER BY SortOrder, ProductId`),
    query<Row>(`SELECT CategoryId, IsBread FROM dbo.ProductCategories`),
  ]);
  const row = { sales_income: num(head[0]?.Bread) };
  const sales = salesRows.map((s) => ({ id: s.CounterSaleId as number, name: s.Name as string, qty: s.Qty, unit_price: s.UnitPrice, amount: s.Amount }));
  const recent = recentRows.map((r) => ({ name: r.Name as string, unit_price: r.UnitPrice }));
  const products = productRows.map((p) => ({ name: p.Name as string, suggested_price: p.SuggestedPrice, category_id: p.CategoryId as number }));
  const categories = categoryRows.map((c) => ({ id: c.CategoryId as number, is_bread: c.IsBread as boolean }));
  const locked = head[0]?.Locked === true;

  // Hızlı seçim: katalogdaki ekmek dışı ürünler (son satış fiyatıyla, yoksa öneri fiyatıyla),
  // sonra katalogda olmayan ama son zamanlarda satılan ek ürünler. Ekmek türleri listelenmez:
  // tezgahta ekmek, çeşidi fark etmeksizin tek tutar olarak girilir.
  const breadCats = new Set((categories ?? []).filter((c) => c.is_bread).map((c) => c.id));
  const key = (n: string) => n.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
  const breadNames = new Set((products ?? []).filter((p) => breadCats.has(p.category_id)).map((p) => key(p.name)));
  // Sıra: en son satılanlar önce (hızlı seçimde ilk 4'ü görünür), sonra katalogdaki diğer ek ürünler.
  const catalogExtra = (products ?? []).filter((p) => !breadCats.has(p.category_id));
  const catalogByKey = new Map(catalogExtra.map((p) => [key(p.name), p]));
  const picks = new Map<string, number | null>();
  const seen = new Set<string>();
  for (const r of recent ?? []) {
    const k = key(r.name);
    if (seen.has(k) || breadNames.has(k)) continue;
    seen.add(k);
    picks.set(catalogByKey.get(k)?.name ?? r.name, Number(r.unit_price));
  }
  for (const p of catalogExtra) {
    if (seen.has(key(p.name))) continue;
    seen.add(key(p.name));
    picks.set(p.name, p.suggested_price == null ? null : Number(p.suggested_price));
  }

  return (
    <>
      <PageHeader
        title="Tezgah"
        description="Tezgahtan gelen ekmek parasını ve satılan ek ürünleri (zeytinyağı, yufka …) yazın; günün tezgah toplamı kendiliğinden çıkar."
        actions={
          <DayNav base="/tezgah" day={day} today={today} />
        }
      />
      <CounterView
        key={day}
        day={day}
        bread={Number(row?.sales_income ?? 0)}
        sales={(sales ?? []).map((r) => ({ ...r, qty: Number(r.qty), unit_price: Number(r.unit_price), amount: Number(r.amount) }))}
        picks={[...picks].slice(0, 300).map(([name, price]) => ({ name, price }))}
        locked={locked}
      />
    </>
  );
}

export default function CounterPage({ searchParams }: PageProps<"/tezgah">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-12 w-60" />
          <div className="grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-tile" />
            <Skeleton className="h-72 rounded-tile" />
          </div>
        </div>
      }
    >
      <Counter searchParams={searchParams as Search} />
    </Suspense>
  );
}
