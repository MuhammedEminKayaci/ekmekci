"use client";

import Link from "next/link";
import { Truck } from "lucide-react";
import { Balance, BalanceBadge, Empty, cx } from "@/components/ui";
import { money, qty } from "@/lib/format";

type Row = {
  customer_id: number;
  customer_name: string;
  driver_id: number;
  delivered_qty: number;
  returned_qty: number;
  net: number;
  collection: number;
};

type Driver = { id: number; name: string; is_owner: boolean };
type Expense = { driver_id: number | null; amount: number };

const GRID =
  "lg:grid lg:grid-cols-[minmax(10rem,1.5fr)_minmax(9rem,1.3fr)_repeat(4,minmax(5.5rem,0.8fr))_minmax(8rem,1fr)] lg:items-center lg:gap-4";

/** "Hepsi" sekmesi: müşteri başına bütün dağıtıcıların toplamı + dağıtıcı özetleri (salt okunur). */
export function AllView({
  rows,
  drivers,
  expenses,
  total,
  onPickDriver,
}: {
  rows: Row[];
  drivers: Driver[];
  expenses: Expense[];
  total: (customerId: number) => number;
  onPickDriver: (id: number) => void;
}) {
  const driverName = new Map(drivers.map((d) => [d.id, d.name]));

  // Müşteri başına topla; sıra: ilk görünen dağıtıcının sırası.
  const byCustomer = new Map<
    number,
    { name: string; delivered: number; returned: number; collection: number; net: number; parts: Array<{ driver: number; qty: number }> }
  >();
  for (const r of rows) {
    const c = byCustomer.get(r.customer_id) ?? { name: r.customer_name, delivered: 0, returned: 0, collection: 0, net: 0, parts: [] };
    c.delivered += r.delivered_qty;
    c.returned += r.returned_qty;
    c.collection += r.collection;
    c.net += r.net;
    c.parts.push({ driver: r.driver_id, qty: r.delivered_qty });
    byCustomer.set(r.customer_id, c);
  }

  const summaries = drivers
    .map((d) => {
      const list = rows.filter((r) => r.driver_id === d.id);
      const spent = expenses.filter((e) => e.driver_id === d.id).reduce((a, e) => a + Number(e.amount), 0);
      const collected = list.reduce((a, r) => a + r.collection, 0);
      return {
        driver: d,
        customers: list.length,
        delivered: list.reduce((a, r) => a + r.delivered_qty, 0),
        collected,
        spent,
        toHand: collected - spent,
      };
    })
    .filter((s) => s.customers > 0 || s.spent > 0);

  if (rows.length === 0) {
    return <Empty title="Bu gün hiçbir dağıtıcıya kayıt girilmedi">Kayıt girmek için yukarıdan bir dağıtıcı seçin.</Empty>;
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Dağıtıcı özetleri */}
      <div className="grid gap-3 px-3 sm:grid-cols-2 sm:px-4 xl:grid-cols-3 xl:px-6">
        {summaries.map((s) => (
          <button
            key={s.driver.id}
            type="button"
            onClick={() => onPickDriver(s.driver.id)}
           
            className="neu-sm lift flex flex-col gap-2 rounded-2xl p-4 text-left"
          >
            <span className="flex items-center gap-2 font-semibold">
              <Truck size={16} className="text-sky" /> {s.driver.name}
              <span className="ml-auto text-label font-medium text-ink-3">{s.customers} müşteri</span>
            </span>
            <span className="tnum grid grid-cols-3 gap-2 text-small">
              <span>
                <span className="block text-caption font-semibold text-ink-3">Ekmek</span>
                {qty(s.delivered)}
              </span>
              <span>
                <span className="block text-caption font-semibold text-ink-3">Toplanan</span>
                {money(s.collected)}
              </span>
              <span>
                <span className="block text-caption font-semibold text-ink-3">Teslim edilecek</span>
                <b className="text-brand-deep dark:text-brand">{money(s.toHand)}</b>
              </span>
            </span>
            {s.spent > 0 && <span className="tnum text-label text-debt">Gider − {money(s.spent)}</span>}
          </button>
        ))}
      </div>

      {/* Müşteri toplamları */}
      <div>
        <div className={cx("hidden border-y border-line px-6 py-3 text-label font-semibold text-ink-3", GRID)}>
          <span>Müşteri</span>
          <span>Kim götürdü</span>
          <span className="text-right">Verilen</span>
          <span className="text-right">İade</span>
          <span className="text-right">Alınan</span>
          <span className="text-right">Tutar</span>
          <span className="text-right">Toplam hesap</span>
        </div>
        <ul className="flex flex-col gap-2.5 px-3 sm:px-4 lg:gap-0 lg:px-0">
          {[...byCustomer.entries()].map(([id, c]) => (
            <li
              key={id}
              className={cx(
                "neu-sm rounded-2xl p-4 lg:rounded-none lg:border-b lg:border-line lg:bg-transparent lg:px-6 lg:py-3 lg:shadow-none",
                GRID,
              )}
            >
              <div className="flex items-start justify-between gap-3 lg:block">
                <Link href={`/musteriler/${id}`} className="truncate font-semibold hover:text-brand-deep">
                  {c.name}
                </Link>
                <span className="flex flex-col items-end gap-0.5 lg:hidden">
                  <Balance value={total(id)} />
                  <BalanceBadge value={total(id)} kind="total" />
                </span>
              </div>
              <p className="mt-1 flex flex-wrap gap-1.5 lg:mt-0">
                {c.parts.map((p) => (
                  <span key={p.driver} className="rounded-full bg-sky-soft px-2 py-0.5 text-caption font-semibold text-sky">
                    {driverName.get(p.driver) ?? "?"} {qty(p.qty)}
                  </span>
                ))}
              </p>
              <dl className="tnum mt-3 grid grid-cols-4 gap-2 text-small lg:contents">
                <Cell label="Verilen" value={qty(c.delivered)} />
                <Cell label="İade" value={qty(c.returned)} />
                <Cell label="Alınan" value={money(c.collection)} />
                <Cell label="Tutar" value={money(c.net)} />
                <div className="hidden flex-col items-end gap-0.5 lg:flex">
                  <Balance value={total(id)} />
                  <BalanceBadge value={total(id)} kind="total" />
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 lg:text-right">
      <dt className="text-caption font-semibold text-ink-3 lg:sr-only">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  );
}
