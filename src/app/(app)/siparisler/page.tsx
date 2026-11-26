import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton, WeekNav } from "@/components/ui";
import { addDays, isISODate, todayTR, weekDays, weekStart } from "@/lib/format";
import { day as dbDay, isoDay, num, proc, query, type Row } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { DayExpense } from "./driver-day";
import { WeekBoard, type BoardCustomer, type BoardDriver, type BoardLine, type BoardRow, type CustomerProduct } from "./week-board";

export const metadata: Metadata = { title: "Siparişler" };

type Search = Promise<{ hafta?: string; gun?: string }>;

async function Board({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const profile = await requireUser();
  const today = todayTR();
  const currentWeek = weekStart(today);
  const start = weekStart(isISODate(sp.hafta) ? sp.hafta : today);
  const days = weekDays(start);
  const day = isISODate(sp.gun) && days.includes(sp.gun) ? sp.gun : days.includes(today) ? today : start;

  const [{ sets }, customers, drivers] = await Promise.all([
    proc("dbo.sp_Week_Board", { Date: dbDay(start) }),
    query<Row>(`SELECT CustomerId, Name, CustomerTypeId, Products, IsActive, BuysProducts, Balance FROM dbo.vw_CustomerOverview ORDER BY Name`),
    query<Row>(`SELECT DriverId, Name, IsOwner, IsActive FROM dbo.Drivers ORDER BY SortOrder, DriverId`),
  ]);
  const [rows, lines, expenses, driverDays] = sets as Row[][];

  const hrefFor = (offset: number) => `/siparisler?hafta=${addDays(start, offset * 7)}`;
  const locked = rows[0]?.IsLocked ?? (await query<{ L: boolean }>("SELECT L = dbo.fn_IsLocked(@D)", { D: dbDay(start) }))[0]?.L ?? false;
  // Sipariş + ürün satırları
  const linesByOrder = new Map<number, BoardLine[]>();
  for (const l of lines) {
    const list = linesByOrder.get(l.OrderId) ?? [];
    list.push({
      id: l.OrderLineId,
      product_id: l.ProductId,
      product_name: l.ProductName,
      product_unit: l.ProductUnit,
      delivered_qty: l.DeliveredQty,
      returned_qty: l.ReturnedQty,
      unit_price: num(l.UnitPrice),
    });
    linesByOrder.set(l.OrderId, list);
  }
  const boardRows: BoardRow[] = rows.map((r) => ({
    id: r.OrderId,
    customer_id: r.CustomerId,
    customer_name: r.CustomerName,
    customer_type: r.CustomerTypeId,
    driver_id: r.DriverId,
    entry_date: isoDay(r.EntryDate)!,
    sort_order: r.SortOrder,
    collection: num(r.Collection),
    is_locked: r.IsLocked,
    lines: linesByOrder.get(r.OrderId) ?? [],
  }));
  const all = customers.map((c) => ({
    id: c.CustomerId as number,
    name: c.Name as string,
    type: c.CustomerTypeId as number,
    is_active: c.IsActive as boolean,
    buys_products: c.BuysProducts as boolean,
    balance: num(c.Balance),
    products: (JSON.parse(c.Products || "[]") as Array<{ ProductId: number; Name: string; Unit: string; Price: number | null }>).map(
      (p) => ({ product_id: p.ProductId, name: p.Name, unit: p.Unit, price: p.Price == null ? null : Number(p.Price) }),
    ),
  }));
  // Müşterinin bütün geçmişiyle güncel toplam hesabı (+ borç, − alacak).
  const balances = Object.fromEntries(all.map((c) => [c.id, c.balance]));

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
        customers={all.filter((c) => c.is_active && c.buys_products).map((c) => ({ id: c.id, name: c.name, type: c.type, products: c.products as CustomerProduct[] })) as BoardCustomer[]}
        balances={balances}
        isAdmin={profile.isAdmin}
        drivers={drivers.map((d) => ({ id: d.DriverId, name: d.Name, is_owner: d.IsOwner, is_active: d.IsActive })) as BoardDriver[]}
        expenses={expenses.map((e) => ({
          id: e.ExpenseId,
          entry_date: isoDay(e.EntryDate)!,
          driver_id: e.DriverId,
          amount: num(e.Amount),
          category: e.CategoryName,
          description: e.Description,
        })) as DayExpense[]}
        driverDays={driverDays.map((d) => ({
          entry_date: isoDay(d.EntryDate)!,
          driver_id: d.DriverId as number,
          handed_over: d.HandedOver == null ? null : num(d.HandedOver),
        }))}
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
