import type { Metadata } from "next";
import { Suspense } from "react";
import { DayNav } from "@/components/day-nav";
import { PageHeader, Segmented, Skeleton } from "@/components/ui";
import { addDays, isISODate, monthStart, todayTR, weekStart } from "@/lib/format";
import { getSessionProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ExpensesView, type Expense, type Period } from "./expenses-view";

export const metadata: Metadata = { title: "Giderler" };

type Search = Promise<{ gun?: string; donem?: string }>;

function nextMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

async function Expenses({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayTR();
  const day = isISODate(sp.gun) ? sp.gun : today;
  const period: Period = sp.donem === "hafta" || sp.donem === "ay" ? sp.donem : "gun";
  const from = period === "gun" ? day : period === "hafta" ? weekStart(day) : monthStart(day);
  const to = period === "gun" ? day : period === "hafta" ? addDays(weekStart(day), 6) : addDays(nextMonth(monthStart(day)), -1);

  const [{ data: rows }, { data: drivers }, { data: types }, { data: customers }, { data: settings }, profile] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, entry_date, place, driver_id, customer_id, kind, payment, amount, category, description")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("drivers").select("id, name, is_active").order("sort_order"),
    supabase.from("expense_categories").select("id, name").order("sort_order").order("name"),
    supabase.from("customer_overview").select("id, name, balance, is_active").order("name"),
    supabase.from("app_settings").select("lock_past_weeks").maybeSingle(),
    getSessionProfile(),
  ]);

  const locked = (settings?.lock_past_weeks ?? true) && weekStart(day) < weekStart(today);
  const q = (d: string, p: Period) => `/giderler?gun=${d}${p === "gun" ? "" : `&donem=${p}`}`;

  return (
    <>
      <PageHeader
        title="Giderler"
        description="Bütün giderler. Bir cariye (ör. oduncu) yazılan gider o cariyi bizden alacaklı yapar; ona ödeme yapınca alacağı kapanır."
        actions={
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:items-end">
            <Segmented
              active={period}
              items={[
                { value: "gun", label: "Gün", href: q(day, "gun") },
                { value: "hafta", label: "Hafta", href: q(day, "hafta") },
                { value: "ay", label: "Ay", href: q(day, "ay") },
              ]}
            />
            <DayNav
              base="/giderler"
              day={day}
              today={today}
              step={period === "gun" ? "day" : period === "hafta" ? "week" : "month"}
              query={period === "gun" ? undefined : `donem=${period}`}
            />
          </div>
        }
      />
      <ExpensesView
        key={`${day}-${period}`}
        day={day}
        period={period}
        from={from}
        to={to}
        expenses={(rows ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as Expense[]}
        drivers={(drivers ?? []).map((d) => ({ id: d.id, name: d.name, is_active: d.is_active }))}
        customers={(customers ?? []).filter((c) => c.id != null).map((c) => ({ id: c.id!, name: c.name ?? "", balance: Number(c.balance ?? 0), is_active: c.is_active ?? true }))}
        types={types ?? []}
        isAdmin={profile?.isAdmin ?? false}
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
          <Skeleton className="h-24 rounded-tile" />
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
