import type { Metadata } from "next";
import { Suspense } from "react";
import { DayNav } from "@/components/day-nav";
import { PageHeader, Segmented, Skeleton } from "@/components/ui";
import { addDays, isISODate, monthStart, todayTR, weekStart } from "@/lib/format";
import { day as dbDay, isoDay, num, query, type Row } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ExpensesView, type Expense, type Period } from "./expenses-view";

export const metadata: Metadata = { title: "Giderler" };

type Search = Promise<{ gun?: string; donem?: string }>;

function nextMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

async function Expenses({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const profile = await requireUser();
  const today = todayTR();
  const day = isISODate(sp.gun) ? sp.gun : today;
  const period: Period = sp.donem === "hafta" || sp.donem === "ay" ? sp.donem : "gun";
  const from = period === "gun" ? day : period === "hafta" ? weekStart(day) : monthStart(day);
  const to = period === "gun" ? day : period === "hafta" ? addDays(weekStart(day), 6) : addDays(nextMonth(monthStart(day)), -1);

  const [expenseRows, driverRows, typeRows, customerRows, lock] = await Promise.all([
    query<Row>(
      `SELECT ExpenseId, EntryDate, PlaceCode, DriverId, CustomerId, KindCode, PaymentCode, Amount, CategoryName, Description
         FROM dbo.vw_ExpenseDetails WHERE EntryDate BETWEEN @From AND @To
        ORDER BY EntryDate DESC, CreatedAt DESC, ExpenseId DESC`,
      { From: dbDay(from), To: dbDay(to) },
    ),
    query<Row>(`SELECT DriverId, Name, IsActive FROM dbo.Drivers ORDER BY SortOrder, DriverId`),
    query<Row>(`SELECT ExpenseCategoryId, Name FROM dbo.ExpenseCategories WHERE IsActive = 1 ORDER BY SortOrder, Name`),
    query<Row>(
      `SELECT c.CustomerId, c.Name, b.Balance, c.IsActive FROM dbo.Customers c
         JOIN dbo.vw_CustomerBalances b ON b.CustomerId = c.CustomerId ORDER BY c.Name`,
    ),
    query<Row>(`SELECT L = dbo.fn_IsLocked(@D)`, { D: dbDay(day) }),
  ]);
  const rows = expenseRows.map((e) => ({
    id: e.ExpenseId,
    entry_date: isoDay(e.EntryDate)!,
    place: e.PlaceCode,
    driver_id: e.DriverId,
    customer_id: e.CustomerId,
    kind: e.KindCode,
    payment: e.PaymentCode,
    amount: num(e.Amount),
    category: e.CategoryName,
    description: e.Description,
  }));
  const drivers = driverRows.map((d) => ({ id: d.DriverId as number, name: d.Name as string, is_active: d.IsActive as boolean }));
  const types = typeRows.map((t) => ({ id: t.ExpenseCategoryId as number, name: t.Name as string }));
  const customers = customerRows.map((c) => ({ id: c.CustomerId, name: c.Name, balance: num(c.Balance), is_active: c.IsActive }));
  const locked = lock[0]?.L === true;
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
