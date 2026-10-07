import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PairChart } from "@/components/pair-chart";
import { Balance, Empty, PageHeader, Skeleton, Stat, Tile, TileTitle, TypeChip, WeekNav } from "@/components/ui";
import { addDays, isISODate, money, qty, shortDate, todayTR, weekDays, weekStart, weekdayShort } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hafta raporu" };

type Search = Promise<{ hafta?: string }>;

async function Report({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayTR();
  const currentWeek = weekStart(today);
  const start = weekStart(isISODate(sp.hafta) ? sp.hafta : today);
  const end = addDays(start, 6);

  const [{ data: summary }, { data: daily }] = await Promise.all([
    supabase.rpc("get_customer_period_summary", { p_from: start, p_to: end }),
    supabase.rpc("get_totals", { p_from: start, p_to: end, p_group: "day" }),
  ]);

  const rows = summary ?? [];
  const active = rows.filter((r) => r.entry_days > 0);
  const t = rows.reduce(
    (a, r) => ({
      delivered: a.delivered + r.delivered_qty,
      returned: a.returned + r.returned_qty,
      net: a.net + r.net_amount,
      collection: a.collection + r.collection,
      delta: a.delta + r.period_delta,
      receivable: a.receivable + Math.max(0, r.closing_balance),
      credit: a.credit + Math.min(0, r.closing_balance),
    }),
    { delivered: 0, returned: 0, net: 0, collection: 0, delta: 0, receivable: 0, credit: 0 },
  );

  const dayMap = new Map((daily ?? []).map((d) => [d.period_start, d]));
  const points = weekDays(start).map((d) => ({
    key: d,
    label: weekdayShort(d),
    sublabel: shortDate(d),
    sale: Number(dayMap.get(d)?.net_amount ?? 0),
    collect: Number(dayMap.get(d)?.collection ?? 0),
  }));

  const returnRate = t.delivered ? Math.round((t.returned / t.delivered) * 1000) / 10 : 0;

  return (
    <>
      <PageHeader
        title="Hafta raporu"
        description="Haftanın satış, iade ve tahsilat özeti; müşteri bazında devreden ve kapanış bakiyeleri."
        actions={
          <WeekNav
            start={start}
            hrefFor={(o) => `/rapor?hafta=${addDays(start, o * 7)}`}
            isCurrent={start === currentWeek}
            currentHref="/rapor"
          />
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        <Tile className="col-span-2">
          <Stat label="Net satış" value={money(t.net)} size="lg" hint={`${qty(t.delivered - t.returned)} ekmek net`} />
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
            <Stat label="Verilen" value={qty(t.delivered)} />
            <Stat label="İade" value={qty(t.returned)} />
            <Stat label="İade oranı" value={`%${returnRate.toLocaleString("tr-TR")}`} />
          </div>
        </Tile>
        <Tile>
          <Stat label="Tahsilat" value={money(t.collection)} hint={`${active.length} müşteriden`} />
        </Tile>
        <Tile>
          <Stat
            label="Hafta farkı"
            value={<Balance value={t.delta} />}
            hint={t.delta > 0 ? "Satış tahsilattan fazla" : t.delta < 0 ? "Tahsilat satıştan fazla" : "Denk"}
          />
        </Tile>

        <Tile className="col-span-2">
          <TileTitle>Günlere göre</TileTitle>
          <PairChart points={points} />
        </Tile>
        <Tile className="col-span-2 flex flex-col justify-between gap-5 sm:flex-row lg:flex-col">
          <Stat label="Hafta sonu toplam alacağımız" value={<span className="text-debt">{money(t.receivable)}</span>} hint="Borçlu müşteriler, hafta kapanışı" />
          <Stat label="Müşterilerin alacağı" value={<span className="text-credit">{money(Math.abs(t.credit))}</span>} hint="Fazla ödenen, hafta kapanışı" />
        </Tile>
      </div>

      <section className="neu mt-5 rounded-tile">
        <div className="p-5 sm:p-6">
          <h2 className="font-display text-[1.15rem] font-semibold tracking-tight">Müşteri bazında</h2>
          <p className="text-[0.85rem] text-ink-3">Devreden + hafta farkı = kapanış bakiyesi</p>
        </div>
        {rows.length === 0 ? (
          <Empty title="Bu hafta hareket yok">Siparişler sayfasında bu haftaya kayıt girildiğinde rapor oluşur.</Empty>
        ) : (
          <>
            <div className="hidden border-y border-line px-6 py-2.5 text-[0.78rem] font-semibold text-ink-3 lg:grid lg:grid-cols-[minmax(11rem,1.6fr)_repeat(7,minmax(5rem,1fr))] lg:gap-4">
              <span>Müşteri</span>
              <span className="text-right">Devreden</span>
              <span className="text-right">Verilen</span>
              <span className="text-right">İade</span>
              <span className="text-right">Tutar</span>
              <span className="text-right">Tahsilat</span>
              <span className="text-right">Hafta</span>
              <span className="text-right">Bakiye</span>
            </div>
            <ul className="flex flex-col gap-2.5 px-3 pb-3 sm:px-4 lg:gap-0 lg:px-0 lg:pb-2">
              {rows.map((r) => (
                <li
                  key={r.customer_id}
                  className="neu-sm rounded-2xl p-4 lg:grid lg:grid-cols-[minmax(11rem,1.6fr)_repeat(7,minmax(5rem,1fr))] lg:items-center lg:gap-4 lg:rounded-none lg:border-b lg:border-line lg:bg-transparent lg:px-6 lg:py-3 lg:shadow-none"
                >
                  <div className="mb-3 flex items-start justify-between gap-3 lg:mb-0">
                    <Link href={`/musteriler/${r.customer_id}?grup=week`} className="min-w-0 hover:underline">
                      <span className="block truncate font-semibold">{r.customer_name}</span>
                      <span className="lg:hidden">
                        <TypeChip type={r.customer_type} />
                      </span>
                    </Link>
                    <span className="text-right lg:hidden">
                      <span className="block text-[0.72rem] font-semibold text-ink-3">Bakiye</span>
                      <Balance value={r.closing_balance} />
                    </span>
                  </div>
                  <dl className="tnum grid grid-cols-3 gap-x-3 gap-y-2 text-[0.88rem] lg:contents">
                    <Cell label="Devreden" value={<Balance value={r.opening_balance} className="font-medium" />} />
                    <Cell label="Verilen" value={qty(r.delivered_qty)} />
                    <Cell label="İade" value={qty(r.returned_qty)} />
                    <Cell label="Tutar" value={money(r.net_amount)} />
                    <Cell label="Tahsilat" value={money(r.collection)} />
                    <Cell label="Hafta" value={<Balance value={r.period_delta} className="font-medium" />} />
                    <div className="hidden text-right lg:block">
                      <Balance value={r.closing_balance} />
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="lg:text-right">
      <dt className="text-[0.72rem] font-semibold text-ink-3 lg:sr-only">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="mb-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-11 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <Skeleton className="col-span-2 h-48 rounded-tile" />
        <Skeleton className="h-48 rounded-tile" />
        <Skeleton className="h-48 rounded-tile" />
      </div>
      <Skeleton className="h-96 rounded-tile" />
    </div>
  );
}

export default function ReportPage({ searchParams }: PageProps<"/rapor">) {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <Report searchParams={searchParams as Search} />
    </Suspense>
  );
}
