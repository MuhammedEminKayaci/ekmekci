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

  const [{ data: row }, { data: sales }, { data: recent }, { data: products }, { data: settings }] = await Promise.all([
    supabase.from("counter_days").select("sales_income").eq("entry_date", day).maybeSingle(),
    supabase.from("counter_sales").select("id, name, qty, unit_price, amount").eq("entry_date", day).order("created_at"),
    supabase
      .from("counter_sales")
      .select("name, unit_price")
      .gte("entry_date", addDays(today, -120))
      .order("entry_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(400),
    supabase.from("products").select("name, suggested_price").eq("is_active", true).order("sort_order"),
    supabase.from("app_settings").select("lock_past_weeks").maybeSingle(),
  ]);

  const locked = (settings?.lock_past_weeks ?? true) && weekStart(day) < weekStart(today);

  // Hızlı seçim: son satılan ek ürünler (son fiyatıyla), sonra katalogdaki ürünler.
  const picks = new Map<string, number | null>();
  for (const r of recent ?? []) if (!picks.has(r.name)) picks.set(r.name, Number(r.unit_price));
  for (const p of products ?? []) if (!picks.has(p.name)) picks.set(p.name, p.suggested_price == null ? null : Number(p.suggested_price));

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
        picks={[...picks].slice(0, 12).map(([name, price]) => ({ name, price }))}
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
