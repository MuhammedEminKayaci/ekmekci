"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, HandCoins, Plus, Search, Users, Wallet } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { Sheet } from "@/components/sheet";
import { Balance, BalanceBadge, Button, Empty, PageHeader, Stat, TypeChip, cx, inputClass, order } from "@/components/ui";
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
  { value: "active", label: "Hepsi" },
  { value: "debt", label: "Borçlu" },
  { value: "credit", label: "Alacaklı" },
  { value: "passive", label: "Pasif" },
];

const ROW_GRID =
  "md:grid md:grid-cols-[minmax(12rem,2fr)_minmax(6rem,0.8fr)_minmax(7rem,0.9fr)_minmax(10rem,1.1fr)_1.5rem] md:items-center md:gap-4";

export function CustomerList({ customers, openNew = false }: { customers: CustomerItem[]; openNew?: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [creating, setCreating] = useState(openNew);

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

  function closeCreate() {
    setCreating(false);
    if (openNew) window.history.replaceState(null, "", "/musteriler");
  }

  return (
    <>
      <PageHeader
        title="Müşteriler"
        description="Her müşterinin kendi ekmek fiyatı ve güncel hesabı. Bir müşteriye dokunarak kartını ve hesap dökümünü açın."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} className="w-full sm:w-auto">
            <Plus size={19} /> Yeni müşteri ekle
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:mb-8 sm:grid-cols-3 sm:gap-5">
        <div style={order(1)} className="neu animate-rise col-span-2 rounded-tile p-5 sm:col-span-1">
          <Stat
            icon={Wallet}
            tone="debt"
            label="Bize borçları"
            value={<span className="text-debt"><AnimatedNumber value={totals.receivable} /></span>}
            hint="Borçlu müşterilerin toplamı"
          />
        </div>
        <div style={order(2)} className="neu animate-rise rounded-tile p-5">
          <Stat
            icon={HandCoins}
            tone="brand"
            label="Fazla ödenen"
            value={<span className="text-credit"><AnimatedNumber value={Math.abs(totals.credit)} /></span>}
          />
        </div>
        <div style={order(3)} className="neu animate-rise rounded-tile p-5">
          <Stat icon={Users} tone="sky" label="Aktif müşteri" value={totals.active} hint={`${customers.length} kayıtlı`} />
        </div>
      </div>

      <section style={order(4)} className="neu animate-rise rounded-tile">
        <div className="flex flex-col gap-3 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
          <div className="relative md:w-96">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Müşteri adıyla ara"
              aria-label="Müşteri ara"
              className={cx(inputClass, "pl-11")}
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
                  "min-h-10 rounded-full px-4 text-[0.85rem] font-semibold transition-all duration-300",
                  filter === f.value ? "brand-fill" : "text-ink-2 hover:text-ink",
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
              <p>Adını ve ekmek fiyatını yazmanız yeterli. Sonra Siparişler sayfasında hemen kullanabilirsiniz.</p>
              <Button variant="primary" onClick={() => setCreating(true)} className="mt-4">
                <Plus size={18} /> Yeni müşteri ekle
              </Button>
            </Empty>
          ) : (
            <Empty title="Sonuç yok">Aramayı ya da filtreyi değiştirin.</Empty>
          )
        ) : (
          <>
            <div className={cx("hidden border-y border-line px-6 py-3 text-[0.8rem] font-semibold text-ink-3", ROW_GRID)}>
              <span>Müşteri</span>
              <span className="text-right">Ekmek fiyatı</span>
              <span className="text-right">Son kayıt</span>
              <span className="text-right">Hesap</span>
              <span />
            </div>
            <ul key={filter} className="flex flex-col gap-2.5 px-3 pb-3 sm:px-4 md:gap-0 md:px-0 md:pb-2">
              {visible.map((c, i) => (
                <li key={c.id} style={order(Math.min(i, 12))} className="animate-rise">
                  <Link
                    href={`/musteriler/${c.id}`}
                    className={cx(
                      "neu-sm group flex items-center gap-3 rounded-2xl p-4 transition-colors duration-200",
                      "md:rounded-none md:border-b md:border-line md:bg-transparent md:px-6 md:py-4 md:shadow-none md:hover:bg-brand-soft/40",
                      ROW_GRID,
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="truncate text-[1.02rem] font-semibold text-ink">{c.name}</span>
                        <TypeChip type={c.type} />
                      </p>
                      <p className="tnum mt-0.5 truncate text-[0.8rem] text-ink-3 md:hidden">
                        Ekmek {money(c.current_price)}
                        {c.last_entry_date ? ` · son kayıt ${shortDate(c.last_entry_date)}` : ""}
                      </p>
                      {c.address && <p className="hidden truncate text-[0.8rem] text-ink-3 md:block">{c.address}</p>}
                    </div>
                    <span className="tnum hidden text-right text-ink-2 md:block">{money(c.current_price)}</span>
                    <span className="tnum hidden text-right text-ink-2 md:block">
                      {c.last_entry_date ? shortDate(c.last_entry_date) : "—"}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <Balance value={c.balance} />
                      <BalanceBadge value={c.balance} />
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-ink-3 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Sheet open={creating} onClose={closeCreate} title="Yeni müşteri">
        <CustomerForm onDone={closeCreate} />
      </Sheet>
    </>
  );
}
