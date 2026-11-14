import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton, WeekNav } from "@/components/ui";
import { addDays, isISODate, todayTR, weekDays, weekStart } from "@/lib/format";
import { getSessionProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { DayExpense } from "./driver-day";
import { WeekBoard, type BoardCustomer, type BoardDriver, type BoardLine, type BoardRow, type CustomerProduct } from "./week-board";

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

  const end = addDays(start, 6);
  const profile = await getSessionProfile();
  const [{ data: rows }, { data: lines }, { data: customers }, { data: settings }, { data: drivers }, { data: expenses }, { data: driverDays }] = await Promise.all([
    supabase.rpc("get_week_board", { p_date: start }),
    supabase.rpc("get_week_lines", { p_date: start }),
    supabase
      .from("customer_overview")
      .select("id, name, type, products, is_active, buys_products, balance")
      .order("name"),
    supabase.from("app_settings").select("lock_past_weeks").maybeSingle(),
    supabase.from("drivers").select("id, name, is_owner, is_active").order("sort_order"),
    supabase
      .from("expenses")
      .select("id, entry_date, driver_id, amount, category, description")
      .eq("place", "driver")
      .gte("entry_date", start)
      .lte("entry_date", end)
      .order("created_at"),
    supabase.from("driver_days").select("entry_date, driver_id, handed_over").gte("entry_date", start).lte("entry_date", end),
  ]);

  const hrefFor = (offset: number) => `/siparisler?hafta=${addDays(start, offset * 7)}`;
  const locked = (settings?.lock_past_weeks ?? true) && start < currentWeek;
  const all = customers ?? [];
  // Sipariş + ürün satırları
  const linesByOrder = new Map<number, BoardLine[]>();
  for (const l of lines ?? []) {
    const list = linesByOrder.get(l.order_id) ?? [];
    list.push({
      id: l.id,
      product_id: l.product_id,
      product_name: l.product_name,
      product_unit: l.product_unit,
      delivered_qty: l.delivered_qty,
      returned_qty: l.returned_qty,
      unit_price: Number(l.unit_price),
    });
    linesByOrder.set(l.order_id, list);
  }
  const boardRows: BoardRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    customer_type: r.customer_type,
    driver_id: r.driver_id,
    entry_date: r.entry_date,
    sort_order: r.sort_order,
    collection: Number(r.collection),
    is_locked: r.is_locked,
    lines: linesByOrder.get(r.id) ?? [],
  }));
  // Müşterinin bütün geçmişiyle güncel toplam hesabı (+ borç, − alacak).
  const balances = Object.fromEntries(all.map((c) => [c.id!, Number(c.balance ?? 0)]));

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
        rows={boardRows}
        customers={all.filter((c) => c.is_active && c.buys_products !== false).map((c) => ({ id: c.id!, name: c.name!, type: c.type!, products: (c.products ?? []) as CustomerProduct[] })) as BoardCustomer[]}
        balances={balances}
        isAdmin={profile?.isAdmin ?? false}
        drivers={(drivers ?? []) as BoardDriver[]}
        expenses={(expenses ?? []) as DayExpense[]}
        driverDays={(driverDays ?? []).map((d) => ({ ...d, handed_over: d.handed_over == null ? null : Number(d.handed_over) }))}
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
