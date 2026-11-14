import type { Metadata } from "next";
import { Suspense } from "react";
import { DayNav } from "@/components/day-nav";
import { PageHeader, Skeleton } from "@/components/ui";
import { addDays, isISODate, todayTR, weekStart } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { CounterView } from "./counter-view";

export const metadata: Metadata = { title: "Tezgah" };

type Search = Promise<{ gun?: string }>;

async function Counter({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayTR();
  const day = isISODate(sp.gun) ? sp.gun : today;

  const [{ data: row }, { data: sales }, { data: recent }, { data: products }, { data: categories }, { data: settings }] = await Promise.all([
    supabase.from("counter_days").select("sales_income").eq("entry_date", day).maybeSingle(),
    supabase.from("counter_sales").select("id, name, qty, unit_price, amount").eq("entry_date", day).order("created_at"),
    supabase
      .from("counter_sales")
      .select("name, unit_price")
      .gte("entry_date", addDays(today, -120))
      .order("entry_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(400),
    supabase.from("products").select("name, suggested_price, category_id").eq("is_active", true).order("sort_order"),
    supabase.from("product_categories").select("id, is_bread"),
    supabase.from("app_settings").select("lock_past_weeks").maybeSingle(),
  ]);

  const locked = (settings?.lock_past_weeks ?? true) && weekStart(day) < weekStart(today);

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
        description="Tezgahtan gelen ekmek parasını ve satılan ek ürünleri (zeytinyağı, yufka …) yazın; günün tezgah toplamı kendiliğinden çıkar. Giderler artık Giderler sayfasında."
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
