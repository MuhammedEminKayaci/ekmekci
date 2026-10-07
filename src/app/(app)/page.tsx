import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChartColumn,
  ClipboardList,
  HandCoins,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { Delta, Gauge, Sparkline } from "@/components/charts";
import { PairChart } from "@/components/pair-chart";
import { Balance, ButtonLink, IconChip, Skeleton, Tile, TileTitle, cx, order } from "@/components/ui";
import {
  addDays,
  longDate,
  money,
  monthStart,
  pctChange,
  qty,
  shortDate,
  todayTR,
  weekStart,
  weekdayLong,
  weekdayShort,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const DATIVE: Record<string, string> = {
  pazartesi: "pazartesiye",
  salı: "salıya",
  çarşamba: "çarşambaya",
  perşembe: "perşembeye",
  cuma: "cumaya",
  cumartesi: "cumartesiye",
  pazar: "pazara",
};

/** "Çarşamba" → "çarşambaya" */
function toDative(day: string) {
  const k = day.toLocaleLowerCase("tr");
  return DATIVE[k] ?? k;
}

type Totals = {
  period_start: string;
  delivered_qty: number;
  returned_qty: number;
  net_amount: number;
  collection: number;
  customer_count: number;
};

function sumRange(map: Map<string, Totals>, from: string, to: string) {
  const acc = { net: 0, collect: 0, delivered: 0, returned: 0 };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = map.get(d);
    if (!r) continue;
    acc.net += Number(r.net_amount);
    acc.collect += Number(r.collection);
    acc.delivered += Number(r.delivered_qty);
    acc.returned += Number(r.returned_qty);
  }
  return acc;
}

async function Dashboard() {
  const supabase = await createClient();
  const today = todayTR();
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const firstWeek = addDays(thisWeek, -7 * 7);
  const month = monthStart(today);
  const from14 = addDays(today, -13);

  const [{ data: daily }, { data: weeks }, { data: monthRows }, { data: balances }] = await Promise.all([
    supabase.rpc("get_totals", { p_from: from14 < lastWeek ? from14 : lastWeek, p_to: today, p_group: "day" }),
    supabase.rpc("get_totals", { p_from: firstWeek, p_to: addDays(thisWeek, 6), p_group: "week" }),
    supabase.rpc("get_totals", { p_from: month, p_to: today, p_group: "month" }),
    supabase.from("customer_overview").select("id, name, balance, last_entry_date").eq("is_active", true).neq("balance", 0),
  ]);

  const dayMap = new Map((daily ?? []).map((r) => [r.period_start, r as Totals]));
  const t = dayMap.get(today);
  const sameDayLastWeek = dayMap.get(addDays(today, -7));

  // Bu hafta ve geçen haftanın aynı dönemi (pazartesiden bugünün gününe kadar).
  const wk = sumRange(dayMap, thisWeek, today);
  const prevWk = sumRange(dayMap, lastWeek, addDays(today, -7));
  const collectRate = wk.net > 0 ? wk.collect / wk.net : null;

  const m = monthRows?.[0];
  const returnRate = m && Number(m.delivered_qty) > 0 ? Number(m.returned_qty) / Number(m.delivered_qty) : null;

  const spark = Array.from({ length: 14 }, (_, i) => Number(dayMap.get(addDays(from14, i))?.net_amount ?? 0));

  const weekMap = new Map((weeks ?? []).map((w) => [w.period_start, w]));
  const points = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(firstWeek, i * 7);
    const row = weekMap.get(start);
    return {
      key: start,
      label: i === 7 ? "Bu" : String(Number(start.slice(8))),
      sublabel: i === 7 ? "hafta" : shortDate(start).split(" ")[1],
      sale: Number(row?.net_amount ?? 0),
      collect: Number(row?.collection ?? 0),
      current: i === 7,
    };
  });
  const total8 = points.reduce((a, p) => ({ sale: a.sale + p.sale, collect: a.collect + p.collect }), { sale: 0, collect: 0 });
  const activeWeeks = points.filter((p) => p.sale > 0).length;

  const list = balances ?? [];
  const receivable = list.reduce((a, c) => a + Math.max(0, Number(c.balance)), 0);
  const credit = Math.abs(list.reduce((a, c) => a + Math.min(0, Number(c.balance)), 0));
  const debtors = list
    .filter((c) => Number(c.balance) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5);
  const topDebt = Number(debtors[0]?.balance ?? 0);
  const debtShare = receivable + credit > 0 ? (receivable / (receivable + credit)) * 100 : 0;

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

      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-12">
        {/* ── Bugün ─────────────────────────────────────────────── */}
        <section
          style={order(0)}
          className="brand-fill animate-rise relative col-span-2 flex flex-col overflow-hidden rounded-tile p-5 sm:p-7 lg:col-span-7"
        >
          <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/[0.07]" aria-hidden />
          <div className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-black/[0.06]" aria-hidden />

          <div className="relative flex items-center justify-between gap-3">
            <h2 className="font-display text-[1.15rem] font-semibold">Bugünün satışı</h2>
            <span className="rounded-full bg-white/20 px-3 py-1 text-[0.78rem] font-semibold">
              {t ? `${t.customer_count} müşteri` : "Henüz kayıt yok"}
            </span>
          </div>

          <div className="relative mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
            <p className="font-display tnum text-[2.8rem] leading-none font-semibold tracking-[-0.03em] sm:text-[3.6rem]">
              <AnimatedNumber value={Number(t?.net_amount ?? 0)} />
            </p>
            <div className="pb-1.5">
              <Delta
                onDark
                value={pctChange(Number(t?.net_amount ?? 0), Number(sameDayLastWeek?.net_amount ?? 0))}
                suffix={`geçen ${toDative(weekdayLong(today))} göre`}
              />
            </div>
          </div>

          <div className="relative mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[0.75rem] font-semibold text-white/75">
              <span>Son 14 gün</span>
              <span className="tnum">{shortDate(from14)} – {shortDate(today)}</span>
            </div>
            <Sparkline values={spark} height={70} />
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-white/12 p-3.5 ring-1 ring-white/15 sm:p-4">
            {[
              { label: "Verilen", node: <AnimatedNumber value={Number(t?.delivered_qty ?? 0)} format="qty" />, unit: "adet" },
              { label: "İade", node: <AnimatedNumber value={Number(t?.returned_qty ?? 0)} format="qty" />, unit: "adet" },
              { label: "Alınan para", node: <AnimatedNumber value={Number(t?.collection ?? 0)} />, unit: "" },
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="text-[0.75rem] font-semibold text-white/75">{s.label}</p>
                <p className="font-display truncate text-[1.2rem] font-semibold sm:text-[1.4rem]">
                  {s.node}
                  {s.unit && <span className="ml-1 font-sans text-[0.75rem] font-semibold text-white/70">{s.unit}</span>}
                </p>
              </div>
            ))}
          </div>

          <Link
            href="/siparisler"
            className="group relative mt-5 inline-flex min-h-12 w-fit items-center gap-2 rounded-xl bg-white px-4 font-semibold text-[#0a5a32] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)] transition-transform duration-200 active:scale-[0.97]"
          >
            Bugünün siparişlerini gir
            <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </section>

        {/* ── Göstergeler ───────────────────────────────────────── */}
        <div className="col-span-2 grid grid-cols-2 gap-4 sm:gap-5 lg:col-span-5">
          <Kpi i={1} icon={TrendingUp} tone="brand" label="Bu hafta satış">
            <p className="font-display tnum truncate text-[1.5rem] font-semibold tracking-[-0.02em] sm:text-[1.65rem]">
              <AnimatedNumber value={wk.net} />
            </p>
            <Delta value={pctChange(wk.net, prevWk.net)} suffix="geçen haftaya göre" />
          </Kpi>

          <Kpi i={2} icon={HandCoins} tone="sky" label="Bu hafta alınan">
            <p className="font-display tnum truncate text-[1.5rem] font-semibold tracking-[-0.02em] sm:text-[1.65rem]">
              <AnimatedNumber value={wk.collect} />
            </p>
            <Delta value={pctChange(wk.collect, prevWk.collect)} suffix="geçen haftaya göre" />
          </Kpi>

          <Tile i={3} className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
            <Gauge ratio={collectRate} label="tahsil" tone="sky" />
            <div className="min-w-0">
              <p className="text-[0.85rem] font-semibold text-ink">Tahsilat oranı</p>
              <p className="mt-0.5 text-[0.78rem] text-ink-3">Bu haftaki satışın ne kadarının parası alındı</p>
            </div>
          </Tile>

          <Kpi i={4} icon={ArrowDownLeft} tone="amber" label="Bu ay iade">
            <p className="font-display tnum text-[1.5rem] font-semibold tracking-[-0.02em] sm:text-[1.65rem]">
              {returnRate == null ? "—" : `%${(returnRate * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-bg-deep" aria-hidden>
              <div className="h-full rounded-full bg-amber" style={{ width: `${Math.min(100, (returnRate ?? 0) * 100)}%` }} />
            </div>
            <p className="text-[0.76rem] text-ink-3">
              {qty(m?.returned_qty)} / {qty(m?.delivered_qty)} ekmek geri döndü
            </p>
          </Kpi>
        </div>

        {/* ── Son 8 hafta ───────────────────────────────────────── */}
        <Tile i={5} className="col-span-2 lg:col-span-7">
          <TileTitle
            icon={<IconChip icon={ChartColumn} tone="brand" size="sm" />}
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
          <dl className="mb-5 grid grid-cols-3 gap-3 rounded-2xl neu-inset p-3.5 sm:p-4">
            <Summary label="Toplam satış" value={money(total8.sale)} />
            <Summary label="Toplam alınan" value={money(total8.collect)} />
            <Summary label="Haftalık ort." value={money(activeWeeks ? Math.round(total8.sale / activeWeeks) : 0)} />
          </dl>
          <PairChart points={points} height={250} />
        </Tile>

        {/* ── Açık hesaplar ─────────────────────────────────────── */}
        <Tile i={6} className="col-span-2 flex flex-col lg:col-span-5">
          <TileTitle
            icon={<IconChip icon={Wallet} tone="debt" size="sm" />}
            aside={
              <Link
                href="/musteriler"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.85rem] font-semibold text-brand-deep hover:bg-brand-soft dark:text-brand"
              >
                Tümü <ArrowUpRight size={15} />
              </Link>
            }
          >
            Açık hesaplar
          </TileTitle>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-debt-soft p-4 ring-1 ring-debt/15">
              <p className="text-[0.8rem] font-semibold text-debt">Bize borçları</p>
              <p className="font-display tnum mt-0.5 truncate text-[1.5rem] font-semibold text-debt">
                <AnimatedNumber value={receivable} />
              </p>
            </div>
            <div className="rounded-2xl bg-credit-soft p-4 ring-1 ring-credit/15">
              <p className="text-[0.8rem] font-semibold text-credit">Fazla ödenen</p>
              <p className="font-display tnum mt-0.5 truncate text-[1.5rem] font-semibold text-credit">
                <AnimatedNumber value={credit} />
              </p>
            </div>
          </div>

          {receivable + credit > 0 && (
            <div className="mt-3 flex h-2 gap-[3px] overflow-hidden rounded-full" aria-hidden>
              <div className="rounded-full bg-debt transition-[width] duration-700" style={{ width: `${debtShare}%` }} />
              <div className="flex-1 rounded-full bg-credit" />
            </div>
          )}

          <p className="mt-5 mb-1 text-[0.78rem] font-semibold text-ink-3">En çok borcu olanlar</p>
          {debtors.length > 0 ? (
            <ol className="flex flex-col">
              {debtors.map((c, i) => (
                <li key={c.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/musteriler/${c.id}`}
                    className="block rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-brand-soft/50"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className={cx(
                            "grid size-7 shrink-0 place-items-center rounded-full text-[0.75rem] font-bold",
                            i === 0 ? "bg-debt text-white" : "bg-bg-deep text-ink-2",
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{c.name}</span>
                          {c.last_entry_date && (
                            <span className="block text-[0.75rem] text-ink-3">
                              Son kayıt {weekdayShort(c.last_entry_date)} {shortDate(c.last_entry_date)}
                            </span>
                          )}
                        </span>
                      </span>
                      <Balance value={Number(c.balance)} className="shrink-0" />
                    </span>
                    <span className="mt-2 ml-10 block h-1.5 overflow-hidden rounded-full bg-bg-deep" aria-hidden>
                      <span
                        className="block h-full rounded-full bg-debt/70"
                        style={{ width: `${topDebt ? (Number(c.balance) / topDebt) * 100 : 0}%` }}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-2xl bg-credit-soft px-4 py-3 text-[0.9rem] font-semibold text-credit">
              Borçlu müşteri yok. Bütün hesaplar kapalı ya da fazla ödenmiş.
            </p>
          )}
        </Tile>
      </div>
    </>
  );
}

function Kpi({
  i,
  icon,
  tone,
  label,
  children,
}: {
  i: number;
  icon: React.ComponentProps<typeof IconChip>["icon"];
  tone: React.ComponentProps<typeof IconChip>["tone"];
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tile i={i} className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <IconChip icon={icon} tone={tone} size="sm" />
        <p className="truncate text-[0.82rem] font-semibold text-ink-2">{label}</p>
      </div>
      {children}
    </Tile>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.72rem] font-semibold text-ink-3">{label}</dt>
      <dd className="font-display tnum truncate text-[1rem] font-semibold sm:text-[1.15rem]">{value}</dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-11 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-12">
        <Skeleton className="col-span-2 h-[26rem] rounded-tile lg:col-span-7" />
        <div className="col-span-2 grid grid-cols-2 gap-5 lg:col-span-5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-tile" />
          ))}
        </div>
        <Skeleton className="col-span-2 h-96 rounded-tile lg:col-span-7" />
        <Skeleton className="col-span-2 h-96 rounded-tile lg:col-span-5" />
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
