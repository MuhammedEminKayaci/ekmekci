import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, ClipboardList } from "lucide-react";
import { PairChart } from "@/components/pair-chart";
import { Balance, ButtonLink, Empty, Skeleton, Stat, Tile, TileTitle } from "@/components/ui";
import {
  addDays,
  longDate,
  money,
  monthLabel,
  monthStart,
  qty,
  shortDate,
  todayTR,
  weekStart,
  weekdayLong,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

async function Dashboard() {
  const supabase = await createClient();
  const today = todayTR();
  const thisWeek = weekStart(today);
  const firstWeek = addDays(thisWeek, -7 * 7);
  const month = monthStart(today);

  const [{ data: todayRows }, { data: weeks }, { data: monthRows }, { data: balances }] = await Promise.all([
    supabase.rpc("get_totals", { p_from: today, p_to: today, p_group: "day" }),
    supabase.rpc("get_totals", { p_from: firstWeek, p_to: addDays(thisWeek, 6), p_group: "week" }),
    supabase.rpc("get_totals", { p_from: month, p_to: today, p_group: "month" }),
    supabase.from("customer_overview").select("id, name, balance, last_entry_date").neq("balance", 0),
  ]);

  const d = todayRows?.[0];
  const m = monthRows?.[0];
  const weekMap = new Map((weeks ?? []).map((w) => [w.period_start, w]));
  const w = weekMap.get(thisWeek);

  const points = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(firstWeek, i * 7);
    const row = weekMap.get(start);
    return {
      key: start,
      label: i === 7 ? "Bu" : String(Number(start.slice(8))),
      sublabel: i === 7 ? "hafta" : shortDate(start).split(" ")[1],
      sale: Number(row?.net_amount ?? 0),
      collect: Number(row?.collection ?? 0),
    };
  });

  const list = balances ?? [];
  const receivable = list.reduce((a, c) => a + Math.max(0, Number(c.balance)), 0);
  const credit = list.reduce((a, c) => a + Math.min(0, Number(c.balance)), 0);
  const debtors = list
    .filter((c) => Number(c.balance) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5);

  return (
    <>
      <header className="mb-6 sm:mb-8">
        <p className="text-ink-2">{longDate(today)}</p>
        <h1 className="font-display text-[2rem] leading-[1.05] font-semibold tracking-[-0.02em] sm:text-[2.6rem]">
          {weekdayLong(today)}
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        {/* Bugün */}
        <Tile className="col-span-2 flex flex-col">
          <TileTitle
            aside={
              <ButtonLink href="/siparisler" variant="primary" className="min-h-10 px-3.5 text-[0.85rem]">
                <ClipboardList size={16} /> Siparişler
              </ButtonLink>
            }
          >
            Bugün
          </TileTitle>
          {d ? (
            <>
              <Stat label="Net satış" value={money(d.net_amount)} size="lg" hint={`${d.customer_count} müşteri`} />
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <Stat label="Verilen" value={qty(d.delivered_qty)} />
                <Stat label="İade" value={qty(d.returned_qty)} />
                <Stat label="Tahsilat" value={money(d.collection)} />
              </div>
            </>
          ) : (
            <Empty title="Bugün henüz kayıt yok">Siparişler sayfasından bugünün müşterilerini ekleyin.</Empty>
          )}
        </Tile>

        {/* Bu hafta */}
        <Tile>
          <Stat label="Bu hafta net satış" value={money(w?.net_amount)} hint={`${qty(w?.delivered_qty)} ekmek verildi`} />
          <div className="mt-4 border-t border-line pt-4">
            <Stat label="Bu hafta tahsilat" value={money(w?.collection)} />
          </div>
        </Tile>

        {/* Bu ay */}
        <Tile>
          <Stat label={`${monthLabel(today)} tahsilat`} value={money(m?.collection)} hint={`Net satış ${money(m?.net_amount)}`} />
          <div className="mt-4 border-t border-line pt-4">
            <Stat label="Ay farkı" value={<Balance value={Number(m?.period_delta ?? 0)} />} />
          </div>
        </Tile>

        {/* Son 8 hafta */}
        <Tile className="col-span-2">
          <TileTitle
            aside={
              <Link href="/rapor" className="inline-flex items-center gap-1 text-[0.85rem] font-semibold text-ink-2 hover:text-ink">
                Hafta raporu <ArrowUpRight size={15} />
              </Link>
            }
          >
            Son 8 hafta
          </TileTitle>
          <PairChart points={points} height={150} />
        </Tile>

        {/* Bakiyeler */}
        <Tile className="col-span-2">
          <TileTitle
            aside={
              <Link href="/musteriler" className="inline-flex items-center gap-1 text-[0.85rem] font-semibold text-ink-2 hover:text-ink">
                Tümü <ArrowUpRight size={15} />
              </Link>
            }
          >
            Açık hesaplar
          </TileTitle>
          <div className="neu-inset grid grid-cols-2 gap-4 rounded-2xl p-4">
            <Stat label="Toplam alacağımız" value={<span className="text-debt">{money(receivable)}</span>} />
            <Stat label="Müşteri alacağı" value={<span className="text-credit">{money(Math.abs(credit))}</span>} />
          </div>
          {debtors.length > 0 ? (
            <ol className="mt-4 flex flex-col">
              {debtors.map((c) => (
                <li key={c.id} className="border-b border-line last:border-b-0">
                  <Link href={`/musteriler/${c.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-ink">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{c.name}</span>
                      {c.last_entry_date && (
                        <span className="block text-[0.78rem] text-ink-3">Son kayıt {shortDate(c.last_entry_date)}</span>
                      )}
                    </span>
                    <Balance value={Number(c.balance)} className="shrink-0" />
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-ink-2">Borçlu müşteri yok.</p>
          )}
        </Tile>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-11 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <Skeleton className="col-span-2 h-56 rounded-tile" />
        <Skeleton className="h-56 rounded-tile" />
        <Skeleton className="h-56 rounded-tile" />
        <Skeleton className="col-span-2 h-72 rounded-tile" />
        <Skeleton className="col-span-2 h-72 rounded-tile" />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
