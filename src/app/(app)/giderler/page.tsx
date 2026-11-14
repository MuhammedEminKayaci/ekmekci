import type { Metadata } from "next";
import { Suspense } from "react";
import { DayNav } from "@/components/day-nav";
import { PageHeader, Skeleton } from "@/components/ui";
import { isISODate, todayTR, weekStart } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ExpensesView, type Expense } from "./expenses-view";

export const metadata: Metadata = { title: "Giderler" };

type Search = Promise<{ gun?: string }>;

async function Expenses({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayTR();
  const day = isISODate(sp.gun) ? sp.gun : today;

  const [{ data: rows }, { data: drivers }, { data: settings }] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, place, driver_id, amount, category, description")
      .eq("entry_date", day)
      .order("created_at"),
    supabase.from("drivers").select("id, name, is_owner, is_active").order("sort_order"),
    supabase.from("app_settings").select("lock_past_weeks").maybeSingle(),
  ]);

  const locked = (settings?.lock_past_weeks ?? true) && weekStart(day) < weekStart(today);

  return (
    <>
      <PageHeader
        title="Giderler"
        description="Günün bütün giderleri tek yerde: genel giderler, tezgah ve dağıtıcıların giderleri (mazot, yemek …)."
        actions={<DayNav base="/giderler" day={day} today={today} />}
      />
      <ExpensesView
        key={day}
        day={day}
        expenses={(rows ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as Expense[]}
        drivers={(drivers ?? []).map((d) => ({ id: d.id, name: d.is_owner ? "Ben" : d.name, is_active: d.is_active }))}
        locked={locked}
      />
    </>
  );
}

export default function ExpensesPage({ searchParams }: PageProps<"/giderler">) {
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
      <Expenses searchParams={searchParams as Search} />
    </Suspense>
  );
}
