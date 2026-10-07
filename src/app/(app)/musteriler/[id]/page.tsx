import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, FileText, IdCard, Tag, Wallet } from "lucide-react";
import {
  Balance,
  BalanceBadge,
  Empty,
  IconChip,
  Segmented,
  Skeleton,
  Stat,
  Tile,
  TileTitle,
  TypeChip,
  order,
} from "@/components/ui";
import {
  addDays,
  addMonths,
  longDate,
  money,
  monthLabel,
  monthStart,
  qty,
  shortDate,
  todayTR,
  weekRangeLabel,
  weekStart,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { CustomerActions, PriceAction } from "./customer-actions";

export const metadata: Metadata = { title: "Müşteri" };

type Group = "day" | "week" | "month";
type Params = Promise<{ id: string }>;
type Search = Promise<{ grup?: string }>;

const GROUPS: Array<{ value: Group; label: string }> = [
  { value: "day", label: "Gün" },
  { value: "week", label: "Hafta" },
  { value: "month", label: "Ay" },
];

function rangeFor(group: Group, today: string): [string, string] {
  if (group === "day") return [addDays(today, -59), today];
  if (group === "week") return [addDays(weekStart(today), -7 * 25), addDays(weekStart(today), 6)];
  return [addMonths(monthStart(today), -11), today];
}

function periodLabel(group: Group, start: string) {
  if (group === "week") return weekRangeLabel(start);
  if (group === "month") return monthLabel(start);
  return longDate(start);
}

async function Detail({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const group: Group = sp.grup === "week" || sp.grup === "month" ? sp.grup : "day";
  const supabase = await createClient();
  const today = todayTR();
  const [from, to] = rangeFor(group, today);

  const [{ data: customer }, { data: prices }, { data: statement }] = await Promise.all([
    supabase.from("customer_overview").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("customer_prices")
      .select("id, price, valid_from")
      .eq("customer_id", id)
      .order("valid_from", { ascending: false }),
    supabase.rpc("get_customer_statement", { p_customer_id: id, p_from: from, p_to: to, p_group: group }),
  ]);

  if (!customer || customer.id == null) notFound();

  const rows = [...(statement ?? [])].reverse();

  return (
    <>
      <Link href="/musteriler" className="animate-rise mb-4 inline-flex min-h-10 items-center gap-1 rounded-xl pr-3 text-[0.9rem] font-semibold text-ink-2 transition-colors hover:text-brand-deep">
        <ChevronLeft size={17} /> Müşteriler
      </Link>

      <header className="animate-rise mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TypeChip type={customer.type ?? 1} />
            {!customer.is_active && (
              <span className="rounded-full bg-bg-deep px-2 py-0.5 text-[0.72rem] font-semibold text-ink-2">Pasif</span>
            )}
          </div>
          <h1 className="font-display text-[2rem] leading-[1.05] font-semibold tracking-[-0.02em] break-words sm:text-[2.6rem]">
            {customer.name}
          </h1>
        </div>
        <CustomerActions
          customer={{
            id,
            name: customer.name ?? "",
            type: customer.type ?? 1,
            address: customer.address,
            note: customer.note,
            is_active: customer.is_active ?? true,
          }}
        />
      </header>

      <div className="grid gap-4 sm:gap-5 md:grid-cols-6">
        <Tile i={1} className="md:col-span-3 lg:col-span-2">
          <TileTitle icon={<IconChip icon={Wallet} tone={Number(customer.balance ?? 0) > 0 ? "debt" : "brand"} size="sm" />}>
            Güncel hesap
          </TileTitle>
          <p>
            <Balance value={Number(customer.balance ?? 0)} className="font-display text-[2.4rem] leading-none tracking-[-0.02em] sm:text-[2.8rem]" />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <BalanceBadge value={Number(customer.balance ?? 0)} />
            {customer.last_entry_date && (
              <span className="text-[0.8rem] text-ink-3">Son kayıt {shortDate(customer.last_entry_date)}</span>
            )}
          </div>
        </Tile>

        <Tile i={2} className="md:col-span-3 lg:col-span-2">
          <TileTitle icon={<IconChip icon={Tag} tone="amber" size="sm" />} aside={<PriceAction customerId={id} today={today} />}>
            Ekmek fiyatı
          </TileTitle>
          <Stat
            label="Şu an"
            value={money(customer.current_price)}
            hint={customer.price_since ? `${longDate(customer.price_since)} tarihinden beri` : undefined}
          />
          {prices && prices.length > 1 && (
            <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3">
              {prices.slice(0, 5).map((p) => (
                <li key={p.id} className="tnum flex justify-between text-[0.85rem]">
                  <span className="text-ink-2">{longDate(p.valid_from)}</span>
                  <span className="font-semibold">{money(p.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile i={3} className="md:col-span-6 lg:col-span-2">
          <TileTitle icon={<IconChip icon={IdCard} tone="sky" size="sm" />}>Kart bilgileri</TileTitle>
          <dl className="flex flex-col gap-3 text-[0.9rem]">
            <div>
              <dt className="text-[0.78rem] font-semibold text-ink-3">Adres</dt>
              <dd className="text-ink">{customer.address || "—"}</dd>
            </div>
            <div>
              <dt className="text-[0.78rem] font-semibold text-ink-3">Not</dt>
              <dd className="whitespace-pre-line text-ink">{customer.note || "—"}</dd>
            </div>
            {customer.created_at && (
              <div>
                <dt className="text-[0.78rem] font-semibold text-ink-3">Kayıt tarihi</dt>
                <dd className="text-ink">{longDate(customer.created_at.slice(0, 10))}</dd>
              </div>
            )}
          </dl>
        </Tile>

        <section style={order(4)} className="neu animate-rise rounded-tile md:col-span-6">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="flex items-center gap-2.5 font-display text-[1.15rem] font-semibold tracking-tight">
                <IconChip icon={FileText} tone="brand" size="sm" /> Hesap dökümü
              </h2>
              <p className="text-[0.85rem] text-ink-3">
                {shortDate(from)} – {shortDate(to)} · en yeni üstte
              </p>
            </div>
            <Segmented
              active={group}
              items={GROUPS.map((g) => ({ value: g.value, label: g.label, href: `/musteriler/${id}?grup=${g.value}` }))}
            />
          </div>

          {rows.length === 0 ? (
            <Empty title="Bu aralıkta hareket yok">Siparişler sayfasından bu müşteriye kayıt girildiğinde burada görünür.</Empty>
          ) : (
            <>
              <div className="hidden border-y border-line px-6 py-2.5 text-[0.78rem] font-semibold text-ink-3 lg:grid lg:grid-cols-[minmax(10rem,1.6fr)_repeat(6,minmax(5.5rem,1fr))] lg:gap-4">
                <span>Dönem</span>
                <span className="text-right">Verilen</span>
                <span className="text-right">İade</span>
                <span className="text-right">Tutar</span>
                <span className="text-right">Alınan para</span>
                <span className="text-right">Fark</span>
                <span className="text-right">Hesap</span>
              </div>
              <ul className="flex flex-col gap-2.5 px-3 pb-3 sm:px-4 lg:gap-0 lg:px-0 lg:pb-2">
                {rows.map((r) => (
                  <li
                    key={r.period_start}
                    className="neu-sm rounded-2xl p-4 lg:grid lg:grid-cols-[minmax(10rem,1.6fr)_repeat(6,minmax(5.5rem,1fr))] lg:items-center lg:gap-4 lg:rounded-none lg:border-b lg:border-line lg:bg-transparent lg:px-6 lg:py-3 lg:shadow-none lg:transition-colors lg:hover:bg-brand-soft/40"
                  >
                    <div className="mb-3 flex items-baseline justify-between gap-3 lg:mb-0 lg:block">
                      <p className="font-semibold">{periodLabel(group, r.period_start)}</p>
                      <p className="lg:hidden">
                        <Balance value={r.running_balance} />
                      </p>
                    </div>
                    <dl className="tnum grid grid-cols-3 gap-x-3 gap-y-2 text-[0.88rem] lg:contents">
                      <Cell label="Verilen" value={qty(r.delivered_qty)} />
                      <Cell label="İade" value={qty(r.returned_qty)} />
                      <Cell label="Tutar" value={money(r.net_amount)} />
                      <Cell label="Alınan" value={money(r.collection)} />
                      <Cell label="Fark" value={<Balance value={r.period_delta} className="font-medium" />} />
                      <div className="hidden text-right lg:block">
                        <Balance value={r.running_balance} />
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
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

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-12 w-72" />
      <div className="grid gap-5 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-tile" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-tile" />
    </div>
  );
}

export default function CustomerPage({ params, searchParams }: PageProps<"/musteriler/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} searchParams={searchParams as Search} />
    </Suspense>
  );
}
