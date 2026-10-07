import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton, WeekNav } from "@/components/ui";
import { addDays, isISODate, todayTR, weekDays, weekStart } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { WeekBoard, type BoardCustomer, type BoardRow } from "./week-board";

export const metadata: Metadata = { title: "Siparişler" };

type Search = Promise<{ hafta?: string; gun?: string }>;

async function Board({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayTR();
  const currentWeek = weekStart(today);
  const start = weekStart(isISODate(sp.hafta) ? sp.hafta : today);
  const days = weekDays(start);
  const day = isISODate(sp.gun) && days.includes(sp.gun) ? sp.gun : days.includes(today) ? today : start;

  const [{ data: rows }, { data: customers }, { data: settings }] = await Promise.all([
    supabase.rpc("get_week_board", { p_date: start }),
    supabase
      .from("customer_overview")
      .select("id, name, type, current_price")
      .eq("is_active", true)
      .order("name"),
    supabase.from("app_settings").select("lock_past_weeks").maybeSingle(),
  ]);

  const hrefFor = (offset: number) => `/siparisler?hafta=${addDays(start, offset * 7)}`;
  const locked = (settings?.lock_past_weeks ?? true) && start < currentWeek;

  return (
    <>
      <PageHeader
        title="Siparişler"
        description="Güne müşteri ekleyin; verilen, iade ve tahsilatı girin. Tutarlar müşterinin fiyatıyla hesaplanır."
        actions={
          <WeekNav start={start} hrefFor={hrefFor} isCurrent={start === currentWeek} currentHref="/siparisler" />
        }
      />
      <WeekBoard
        key={start}
        weekStart={start}
        days={days}
        today={today}
        initialDay={day}
        locked={locked}
        rows={(rows ?? []) as BoardRow[]}
        customers={(customers ?? []) as BoardCustomer[]}
      />
    </>
  );
}

function BoardSkeleton() {
  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Skeleton className="h-11 w-56" />
        <Skeleton className="h-11 w-72" />
      </div>
      <div className="mb-6 grid grid-cols-7 gap-2 sm:gap-3">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl sm:h-24" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-tile" />
    </>
  );
}

export default function OrdersPage({ searchParams }: PageProps<"/siparisler">) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <Board searchParams={searchParams as Search} />
    </Suspense>
  );
}
