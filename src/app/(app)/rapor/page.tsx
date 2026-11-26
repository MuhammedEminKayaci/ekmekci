import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChartColumn, HandCoins, Scale, Users, Wallet } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { PairChart } from "@/components/pair-chart";
import { Balance, BalanceBadge, Empty, IconChip, PageHeader, Skeleton, Stat, Tile, TileTitle, TypeChip, WeekNav } from "@/components/ui";
import { addDays, isISODate, money, qty, shortDate, todayTR, weekDays, weekStart, weekdayShort } from "@/lib/format";
import { getCustomerPeriod, getTotals } from "@/lib/reports";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Hafta raporu" };

type Search = Promise<{ hafta?: string }>;

async function Report({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  await requireUser();
  const today = todayTR();
  const currentWeek = weekStart(today);
  const start = weekStart(isISODate(sp.hafta) ? sp.hafta : today);
  const end = addDays(start, 6);

  const [rows, daily] = await Promise.all([getCustomerPeriod(start, end), getTotals(start, end, "day")]);
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

  const dayMap = new Map(daily.map((d) => [d.period_start, d]));
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
        <section className="brand-fill col-span-2 rounded-tile p-5 sm:p-7">
          <p className="text-small font-semibold text-white/80">Haftanın net satışı</p>
          <p className="font-display tnum text-headline leading-none font-semibold tracking-[-0.03em] sm:text-hero">
            <AnimatedNumber value={t.net} />
          </p>
          <p className="mt-1 text-small text-white/75">{qty(t.delivered - t.returned)} ekmek net satıldı</p>
          <div className="mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-white/12 p-3.5 sm:p-4">
            {[
              { label: "Verilen", value: `${qty(t.delivered)} adet` },
              { label: "İade", value: `${qty(t.returned)} adet` },
              { label: "İade oranı", value: `%${returnRate.toLocaleString("tr-TR")}` },
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="text-caption font-semibold text-white/75">{s.label}</p>
                <p className="font-display tnum truncate text-lead font-semibold sm:text-title">{s.value}</p>
              </div>
            ))}
          </div>
        </section>
        <Tile className="col-span-2 sm:col-span-1">
          <Stat
            icon={HandCoins}
            tone="sky"
            label="Alınan para"
            value={<AnimatedNumber value={t.collection} />}
            hint={`${active.length} müşteriden`}
          />
        </Tile>
        <Tile className="col-span-2 sm:col-span-1">
          <Stat
            icon={Scale}
            tone={t.delta > 0 ? "debt" : "brand"}
            label="Haftanın sonucu"
            value={<Balance value={t.delta} />}
            hint={t.delta > 0 ? "Satış, alınan paradan fazla" : t.delta < 0 ? "Alınan para, satıştan fazla" : "Tam denk"}
          />
        </Tile>

        <Tile className="col-span-2">
          <TileTitle icon={<IconChip icon={ChartColumn} tone="brand" size="sm" />}>Günlere göre</TileTitle>
          <PairChart points={points} />
        </Tile>
        <Tile className="col-span-2 flex flex-col gap-4">
          <TileTitle icon={<IconChip icon={Wallet} tone="debt" size="sm" />}>Hafta sonunda açık hesaplar</TileTitle>
          <div className="grid flex-1 grid-cols-1 gap-3 xs:grid-cols-2">
            <div className="flex flex-col justify-center rounded-2xl bg-debt-soft p-5">
              <p className="text-label font-semibold text-debt">Bize borçları</p>
              <p className="font-display tnum mt-1 text-heading font-semibold text-debt">
                <AnimatedNumber value={t.receivable} />
              </p>
              <p className="text-label text-debt/80">Borçlu müşterilerin toplamı</p>
            </div>
            <div className="flex flex-col justify-center rounded-2xl bg-credit-soft p-5">
              <p className="text-label font-semibold text-credit">Fazla ödenen</p>
              <p className="font-display tnum mt-1 text-heading font-semibold text-credit">
                <AnimatedNumber value={Math.abs(t.credit)} />
              </p>
              <p className="text-label text-credit/80">Müşterilerin alacağı</p>
            </div>
          </div>
        </Tile>
      </div>

      <section className="neu mt-5 rounded-tile">
        <div className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2.5 font-display text-lead font-semibold tracking-tight">
            <IconChip icon={Users} tone="sky" size="sm" /> Müşteri bazında
          </h2>
          <p className="mt-1 text-small text-ink-3">Önceki haftalardan devreden + bu haftanın sonucu = hafta sonundaki hesap</p>
        </div>
        {rows.length === 0 ? (
          <Empty title="Bu hafta hareket yok">Siparişler sayfasında bu haftaya kayıt girildiğinde rapor oluşur.</Empty>
        ) : (
          <>
            <div className="hidden border-y border-line px-6 py-2.5 text-label font-semibold text-ink-3 lg:grid lg:grid-cols-[minmax(11rem,1.6fr)_repeat(7,minmax(5rem,1fr))] lg:gap-4">
              <span>Müşteri</span>
              <span className="text-right">Devreden</span>
              <span className="text-right">Verilen</span>
              <span className="text-right">İade</span>
              <span className="text-right">Tutar</span>
              <span className="text-right">Alınan</span>
              <span className="text-right">Hafta</span>
              <span className="text-right">Hesap</span>
            </div>
            <ul className="flex flex-col gap-2.5 px-3 pb-3 sm:px-4 lg:gap-0 lg:px-0 lg:pb-2">
              {rows.map((r) => (
                <li
                  key={r.customer_id}
                  className="neu-sm rounded-2xl p-4 lg:grid lg:grid-cols-[minmax(11rem,1.6fr)_repeat(7,minmax(5rem,1fr))] lg:items-center lg:gap-4 lg:rounded-none lg:border-b lg:border-line lg:bg-transparent lg:px-6 lg:py-3 lg:shadow-none lg:transition-colors lg:hover:bg-brand-soft/40"
                >
                  <div className="mb-3 flex items-start justify-between gap-3 lg:mb-0">
                    <Link href={`/musteriler/${r.customer_id}?grup=week`} className="min-w-0 hover:underline">
                      <span className="block truncate font-semibold">{r.customer_name}</span>
                      <span className="lg:hidden">
                        <TypeChip type={r.customer_type} />
                      </span>
                    </Link>
                    <span className="text-right lg:hidden">
                      <Balance value={r.closing_balance} />
                      <span className="mt-0.5 block"><BalanceBadge value={r.closing_balance} /></span>
                    </span>
                  </div>
                  <dl className="tnum grid grid-cols-3 gap-x-3 gap-y-2 text-small lg:contents">
                    <Cell label="Devreden" value={<Balance value={r.opening_balance} className="font-medium" />} />
                    <Cell label="Verilen" value={qty(r.delivered_qty)} />
                    <Cell label="İade" value={qty(r.returned_qty)} />
                    <Cell label="Tutar" value={money(r.net_amount)} />
                    <Cell label="Alınan" value={money(r.collection)} />
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
      <dt className="text-caption font-semibold text-ink-3 lg:sr-only">{label}</dt>
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
