import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  ClipboardList,
  HandCoins,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { PairChart } from "@/components/pair-chart";
import { Balance, BalanceBadge, ButtonLink, IconChip, Skeleton, Stat, Tile, TileTitle, order } from "@/components/ui";
import { addDays, longDate, money, monthLabel, monthStart, qty, shortDate, todayTR, weekStart, weekdayLong } from "@/lib/format";
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
      <header className="animate-rise mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-semibold text-brand-deep dark:text-brand">{longDate(today)}</p>
          <h1 className="font-display text-[2.1rem] leading-[1.05] font-semibold tracking-[-0.025em] sm:text-[2.6rem]">
            {weekdayLong(today)}
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:flex">
          <ButtonLink href="/musteriler?yeni=1">
            <UserPlus size={18} /> Yeni müşteri
          </ButtonLink>
          <ButtonLink href="/siparisler" variant="primary">
            <ClipboardList size={18} /> Sipariş gir
          </ButtonLink>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        {/* Bugün — tek dolu yeşil kart */}
        <section style={order(0)} className="brand-fill animate-rise relative col-span-2 overflow-hidden rounded-tile p-5 sm:p-7">
          <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute -right-6 -bottom-20 size-72 text-white/[0.07]">
            <path fill="currentColor" d="M30 118c0-40 31-68 70-68s70 28 70 68c0 12-10 22-22 22H52c-12 0-22-10-22-22Z" />
          </svg>
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[1.15rem] font-semibold">Bugün</h2>
              <span className="rounded-full bg-white/20 px-3 py-1 text-[0.78rem] font-semibold">
                {d ? `${d.customer_count} müşteri` : "Henüz kayıt yok"}
              </span>
            </div>
            <p className="mt-5 text-[0.85rem] font-semibold text-white/80">Net satış</p>
            <p className="font-display tnum text-[2.6rem] leading-none font-semibold tracking-[-0.03em] sm:text-[3.2rem]">
              <AnimatedNumber value={Number(d?.net_amount ?? 0)} />
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-white/12 p-3.5 sm:p-4">
              {[
                { label: "Verilen", node: <AnimatedNumber value={Number(d?.delivered_qty ?? 0)} format="qty" /> },
                { label: "İade", node: <AnimatedNumber value={Number(d?.returned_qty ?? 0)} format="qty" /> },
                { label: "Alınan para", node: <AnimatedNumber value={Number(d?.collection ?? 0)} /> },
              ].map((s) => (
                <div key={s.label} className="min-w-0">
                  <p className="text-[0.75rem] font-semibold text-white/75">{s.label}</p>
                  <p className="font-display truncate text-[1.2rem] font-semibold sm:text-[1.35rem]">{s.node}</p>
                </div>
              ))}
            </div>
            <Link
              href="/siparisler"
              className="group mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-4 font-semibold text-[#0a5a32] transition-transform duration-200 active:scale-[0.97]"
            >
              Bugünün siparişlerini gir
              <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </section>

        {/* Bu hafta */}
        <Tile i={1} className="col-span-2 sm:col-span-1">
          <Stat
            icon={TrendingUp}
            tone="brand"
            label="Bu hafta satış"
            value={<AnimatedNumber value={Number(w?.net_amount ?? 0)} />}
            hint={`${qty(w?.delivered_qty)} ekmek verildi`}
          />
          <div className="mt-5 border-t border-line pt-5">
            <Stat icon={HandCoins} tone="sky" label="Bu hafta alınan" value={<AnimatedNumber value={Number(w?.collection ?? 0)} />} />
          </div>
        </Tile>

        {/* Bu ay */}
        <Tile i={2} className="col-span-2 sm:col-span-1">
          <Stat
            icon={CalendarRange}
            tone="sky"
            label={`${monthLabel(today)} alınan`}
            value={<AnimatedNumber value={Number(m?.collection ?? 0)} />}
            hint={`Satış ${money(m?.net_amount)}`}
          />
          <div className="mt-5 border-t border-line pt-5">
            <Stat
              icon={ArrowDownLeft}
              tone="amber"
              label="Bu ay iade"
              value={`${qty(m?.returned_qty)} adet`}
              hint={
                m?.delivered_qty
                  ? `Verilen ekmeğin %${Math.round((Number(m.returned_qty) / Number(m.delivered_qty)) * 100)} kadarı`
                  : undefined
              }
            />
          </div>
        </Tile>

        {/* Son 8 hafta */}
        <Tile i={3} className="col-span-2">
          <TileTitle
            icon={<IconChip icon={TrendingUp} tone="brand" size="sm" />}
            aside={
              <Link
                href="/rapor"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.85rem] font-semibold text-brand-deep hover:bg-brand-soft dark:text-brand"
              >
                Hafta raporu <ArrowUpRight size={15} />
              </Link>
            }
          >
            Son 8 hafta
          </TileTitle>
          <PairChart points={points} height={170} />
        </Tile>

        {/* Açık hesaplar */}
        <Tile i={4} className="col-span-2">
          <TileTitle
            icon={<IconChip icon={Wallet} tone="debt" size="sm" />}
            aside={
              <Link
                href="/musteriler"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.85rem] font-semibold text-brand-deep hover:bg-brand-soft dark:text-brand"
              >
                Tüm müşteriler <ArrowUpRight size={15} />
              </Link>
            }
          >
            Açık hesaplar
          </TileTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-debt-soft p-4">
              <p className="text-[0.8rem] font-semibold text-debt">Bize borçları</p>
              <p className="font-display tnum mt-0.5 truncate text-[1.5rem] font-semibold text-debt">
                <AnimatedNumber value={receivable} />
              </p>
            </div>
            <div className="rounded-2xl bg-credit-soft p-4">
              <p className="text-[0.8rem] font-semibold text-credit">Fazla ödenen</p>
              <p className="font-display tnum mt-0.5 truncate text-[1.5rem] font-semibold text-credit">
                <AnimatedNumber value={Math.abs(credit)} />
              </p>
            </div>
          </div>
          {debtors.length > 0 ? (
            <ol className="mt-4 flex flex-col">
              {debtors.map((c, i) => (
                <li key={c.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/musteriler/${c.id}`}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors duration-200 hover:bg-brand-soft/50"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bg-deep text-[0.8rem] font-bold text-ink-2">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{c.name}</span>
                        {c.last_entry_date && (
                          <span className="block text-[0.78rem] text-ink-3">Son kayıt {shortDate(c.last_entry_date)}</span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <Balance value={Number(c.balance)} />
                      <BalanceBadge value={Number(c.balance)} />
                    </span>
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
        <Skeleton className="col-span-2 h-80 rounded-tile" />
        <Skeleton className="h-80 rounded-tile" />
        <Skeleton className="h-80 rounded-tile" />
        <Skeleton className="col-span-2 h-80 rounded-tile" />
        <Skeleton className="col-span-2 h-80 rounded-tile" />
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
