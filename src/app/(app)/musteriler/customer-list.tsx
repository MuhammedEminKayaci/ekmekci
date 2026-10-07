"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { Balance, Button, Empty, PageHeader, Stat, TypeChip, cx, inputClass } from "@/components/ui";
import { balanceTone, money, shortDate } from "@/lib/format";
import { CustomerForm } from "./customer-form";

export type CustomerItem = {
  id: number;
  name: string;
  type: number;
  address: string | null;
  is_active: boolean;
  current_price: number | null;
  balance: number;
  last_entry_date: string | null;
};

type Filter = "active" | "debt" | "credit" | "passive";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "active", label: "Aktif" },
  { value: "debt", label: "Borçlu" },
  { value: "credit", label: "Alacaklı" },
  { value: "passive", label: "Pasif" },
];

export function CustomerList({ customers }: { customers: CustomerItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [creating, setCreating] = useState(false);

  const totals = useMemo(() => {
    let receivable = 0;
    let credit = 0;
    let active = 0;
    for (const c of customers) {
      if (c.is_active) active++;
      if (c.balance > 0) receivable += c.balance;
      else credit += c.balance;
    }
    return { receivable, credit, active };
  }, [customers]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return customers.filter((c) => {
      if (q && !c.name.toLocaleLowerCase("tr").includes(q)) return false;
      if (filter === "passive") return !c.is_active;
      if (!c.is_active) return false;
      if (filter === "debt") return balanceTone(c.balance) === "debt";
      if (filter === "credit") return balanceTone(c.balance) === "credit";
      return true;
    });
  }, [customers, query, filter]);

  return (
    <>
      <PageHeader
        title="Müşteriler"
        description="Her müşterinin kendi ekmek fiyatı ve güncel bakiyesi."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={18} /> Yeni müşteri
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:mb-8 sm:grid-cols-3">
        <div className="neu col-span-2 rounded-tile p-5 sm:col-span-1">
          <Stat label="Toplam alacağımız" value={<span className="text-debt">{money(totals.receivable)}</span>} hint="Borçlu müşterilerin toplamı" />
        </div>
        <div className="neu rounded-tile p-5">
          <Stat label="Müşteri alacağı" value={<span className="text-credit">{money(Math.abs(totals.credit))}</span>} hint="Fazla ödenen" />
        </div>
        <div className="neu rounded-tile p-5">
          <Stat label="Aktif müşteri" value={totals.active} hint={`${customers.length} kayıtlı`} />
        </div>
      </div>

      <section className="neu rounded-tile">
        <div className="flex flex-col gap-3 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
          <div className="relative md:w-80">
            <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İsimle ara"
              aria-label="Müşteri ara"
              className={cx(inputClass, "pl-10")}
            />
          </div>
          <div className="neu-inset grid grid-cols-4 rounded-full p-1 md:inline-grid" role="group" aria-label="Filtre">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cx(
                  "min-h-9 rounded-full px-3 text-[0.82rem] font-semibold transition-shadow",
                  filter === f.value ? "neu-sm text-ink" : "text-ink-2",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          customers.length === 0 ? (
            <Empty title="İlk müşterinizi ekleyin">
              Müşteri kartında adını ve ekmek fiyatını girin; siparişlerde hemen kullanabilirsiniz.
            </Empty>
          ) : (
            <Empty title="Sonuç yok">Aramayı ya da filtreyi değiştirin.</Empty>
          )
        ) : (
          <>
            <div className="hidden border-y border-line px-6 py-2.5 text-[0.78rem] font-semibold text-ink-3 md:grid md:grid-cols-[minmax(12rem,2fr)_minmax(6rem,1fr)_minmax(7rem,1fr)_minmax(8rem,1fr)_1.5rem] md:gap-4">
              <span>Müşteri</span>
              <span className="text-right">Fiyat</span>
              <span className="text-right">Son kayıt</span>
              <span className="text-right">Bakiye</span>
              <span />
            </div>
            <ul className="flex flex-col gap-2.5 px-3 pb-3 sm:px-4 md:gap-0 md:px-0 md:pb-2">
              {visible.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/musteriler/${c.id}`}
                    className="neu-sm flex items-center gap-3 rounded-2xl p-4 md:grid md:grid-cols-[minmax(12rem,2fr)_minmax(6rem,1fr)_minmax(7rem,1fr)_minmax(8rem,1fr)_1.5rem] md:gap-4 md:rounded-none md:border-b md:border-line md:bg-transparent md:px-6 md:py-3.5 md:shadow-none md:hover:bg-bg-deep/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink">{c.name}</span>
                        <TypeChip type={c.type} />
                      </p>
                      <p className="tnum mt-0.5 truncate text-[0.8rem] text-ink-3 md:hidden">
                        {money(c.current_price)} / adet
                        {c.last_entry_date ? ` · son kayıt ${shortDate(c.last_entry_date)}` : ""}
                      </p>
                      {c.address && <p className="hidden truncate text-[0.8rem] text-ink-3 md:block">{c.address}</p>}
                    </div>
                    <span className="tnum hidden text-right text-ink-2 md:block">{money(c.current_price)}</span>
                    <span className="tnum hidden text-right text-ink-2 md:block">
                      {c.last_entry_date ? shortDate(c.last_entry_date) : "—"}
                    </span>
                    <Balance value={c.balance} className="shrink-0 text-right" />
                    <ChevronRight size={18} className="shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Yeni müşteri">
        <CustomerForm onDone={() => setCreating(false)} />
      </Sheet>
    </>
  );
}
