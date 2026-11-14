import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, Skeleton, buttonClass } from "@/components/ui";
import { addDays, isISODate, longDate, todayTR, weekStart, weekdayLong } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { DayExpense } from "../siparisler/driver-day";
import { CounterForm, type CounterDay } from "./counter-form";

export const metadata: Metadata = { title: "Tezgah" };

type Search = Promise<{ gun?: string }>;

async function Counter({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayTR();
  const day = isISODate(sp.gun) ? sp.gun : today;

  const [{ data: row }, { data: expenses }, { data: settings }] = await Promise.all([
    supabase.from("counter_days").select("*").eq("entry_date", day).maybeSingle(),
    supabase
      .from("expenses")
      .select("id, entry_date, driver_id, amount, category, description")
      .eq("place", "counter")
      .eq("entry_date", day)
      .order("created_at"),
    supabase.from("app_settings").select("lock_past_weeks, counter_bread_price").maybeSingle(),
  ]);

  const locked = (settings?.lock_past_weeks ?? true) && weekStart(day) < weekStart(today);
  const defaultPrice = settings?.counter_bread_price == null ? null : Number(settings.counter_bread_price);

  const initial: CounterDay = {
    opening_cash: Number(row?.opening_cash ?? 0),
    breads_in: Number(row?.breads_in ?? 0),
    breads_left: Number(row?.breads_left ?? 0),
    bread_price: row?.bread_price == null ? defaultPrice : Number(row.bread_price),
    sales_income: Number(row?.sales_income ?? 0),
    closing_cash: Number(row?.closing_cash ?? 0),
    handed_over: row?.handed_over == null ? null : Number(row.handed_over),
    note: row?.note ?? null,
  };

  const nav = (d: string) => `/tezgah?gun=${d}`;

  return (
    <>
      <PageHeader
        title="Tezgah"
        description="Sabah kasayı ve tezgaha konan ekmeği, akşam kalan ekmeği, gelen parayı ve kasada bırakılanı yazın. Hesap kendiliğinden çıkar."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <Link href={nav(addDays(day, -1))} className={buttonClass("soft", "w-12 px-0")} aria-label="Önceki gün" scroll={false}>
              <ChevronLeft size={22} strokeWidth={2.4} />
            </Link>
            <div className="neu-inset flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-control px-4 text-center sm:min-w-60 sm:flex-none">
              <span className="text-[0.92rem] font-semibold whitespace-nowrap">{longDate(day)}</span>
              <span className="text-[0.72rem] font-semibold text-ink-3">{day === today ? "Bugün" : weekdayLong(day)}</span>
            </div>
            <Link href={nav(addDays(day, 1))} className={buttonClass("soft", "w-12 px-0")} aria-label="Sonraki gün" scroll={false}>
              <ChevronRight size={22} strokeWidth={2.4} />
            </Link>
            {day !== today && (
              <Link href="/tezgah" className={buttonClass("primary", "w-full whitespace-nowrap sm:w-auto")} scroll={false}>
                <CalendarCheck size={17} /> Bugüne dön
              </Link>
            )}
          </div>
        }
      />
      <CounterForm
        key={day}
        day={day}
        initial={initial}
        defaultPrice={defaultPrice}
        expenses={(expenses ?? []) as DayExpense[]}
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
