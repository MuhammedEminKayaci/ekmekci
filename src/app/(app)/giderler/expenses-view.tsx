"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Banknote, BookUser, Check, HandCoins, Lock, Plus, ReceiptText, Settings2, Trash2, Wallet, X } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { Combobox } from "@/components/combobox";
import { toast } from "@/components/toast";
import { BalanceBadge, Button, IconChip, Tile, TileTitle, cx, inputClass, order } from "@/components/ui";
import { addExpense, createExpenseCategory, deleteExpense, deleteExpenseCategory } from "@/lib/actions";
import { longDate, money, parseAmount, shortDate, weekdayShort } from "@/lib/format";

export type Period = "gun" | "hafta" | "ay";
export type Expense = {
  id: number;
  entry_date: string;
  place: "driver" | "counter" | "general";
  driver_id: number | null;
  customer_id: number | null;
  kind: "expense" | "payment";
  payment: "cash" | "account";
  amount: number;
  category: string | null;
  description: string | null;
};
type Driver = { id: number; name: string; is_active: boolean };
type Customer = { id: number; name: string; balance: number; is_active: boolean };
type ExpenseType = { id: number; name: string };

// Hareket tablosu: kolonlar arası dikey çizgi (Ürünler tablosuyla aynı dil).
const GRID =
  "lg:grid lg:grid-cols-[6.5rem_minmax(9rem,1.2fr)_7rem_minmax(7rem,0.9fr)_minmax(9rem,1.4fr)_6.5rem_minmax(7rem,0.8fr)_3rem] lg:items-stretch";
const CELL = "lg:flex lg:items-center lg:border-l lg:border-line lg:px-3";

export function ExpensesView({
  day,
  period,
  from,
  to,
  expenses,
  drivers,
  customers,
  types,
  isAdmin,
  locked,
}: {
  day: string;
  period: Period;
  from: string;
  to: string;
  expenses: Expense[];
  drivers: Driver[];
  customers: Customer[];
  types: ExpenseType[];
  isAdmin: boolean;
  locked: boolean;
}) {
  const driverName = new Map(drivers.map((d) => [d.id, d.name]));
  const customer = new Map(customers.map((c) => [c.id, c]));
  const placeLabel = (e: Expense) =>
    e.place === "general" ? "Genel" : e.place === "counter" ? "Tezgah" : (driverName.get(e.driver_id ?? 0) ?? "Dağıtıcı");

  const costs = expenses.filter((e) => e.kind === "expense");
  const totalCost = costs.reduce((a, e) => a + e.amount, 0);
  const onAccount = costs.filter((e) => e.payment === "account").reduce((a, e) => a + e.amount, 0);
  const paid = expenses.filter((e) => e.kind === "payment").reduce((a, e) => a + e.amount, 0);
  const cashOut = totalCost - onAccount + paid;

  // Sağdaki özet: türe göre ve yere göre.
  const byType = new Map<string, number>();
  for (const e of costs) byType.set(e.category || "Türsüz", (byType.get(e.category || "Türsüz") ?? 0) + e.amount);
  const typeRows = [...byType].sort((a, b) => b[1] - a[1]);
  const maxType = typeRows[0]?.[1] ?? 0;
  const byPlace = new Map<string, number>();
  for (const e of costs) byPlace.set(placeLabel(e), (byPlace.get(placeLabel(e)) ?? 0) + e.amount);

  const periodName = period === "gun" ? "Günün" : period === "hafta" ? "Haftanın" : "Ayın";

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {locked && (
        <p className="flex items-center gap-2 rounded-2xl bg-bg-deep px-4 py-3 text-[0.9rem] font-medium text-ink-2">
          <Lock size={16} /> Geçmiş hafta kilitli; yalnızca görüntülenir.
        </p>
      )}

      {/* Özet kartları */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {[
          { label: `${periodName} gideri`, value: totalCost, icon: ReceiptText, tone: "debt" as const, hint: `${costs.length} kalem` },
          { label: "Veresiye (cariye yazılan)", value: onAccount, icon: BookUser, tone: "amber" as const, hint: "Müşteriyi alacaklı yapar" },
          { label: "Carilere ödenen", value: paid, icon: HandCoins, tone: "sky" as const, hint: "Alacağı kapatır, gider değil" },
          { label: "Kasadan çıkan", value: cashOut, icon: Banknote, tone: "brand" as const, hint: "Peşin gider + cari ödeme" },
        ].map((k, i) => (
          <div key={k.label} style={order(i + 1)} className="neu animate-rise rounded-tile p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[0.8rem] font-semibold text-ink-2">
              <IconChip icon={k.icon} tone={k.tone} size="sm" /> <span className="min-w-0 truncate">{k.label}</span>
            </p>
            <p className="tnum mt-2.5 truncate font-display text-[1.35rem] font-semibold sm:text-[1.7rem]">
              <AnimatedNumber value={k.value} />
            </p>
            <p className="truncate text-[0.74rem] text-ink-3">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-12">
        {/* Giriş (solda) */}
        <Tile i={5} className="lg:col-span-7">
          <TileTitle icon={<IconChip icon={Plus} tone="brand" size="sm" />} aside={<span className="text-[0.8rem] font-semibold text-ink-3">{longDate(day)}</span>}>
            Kayıt gir
          </TileTitle>
          {locked ? (
            <p className="rounded-xl bg-bg-deep/60 px-3.5 py-3 text-[0.88rem] text-ink-2">Bu gün kilitli; kayıt girilemez.</p>
          ) : (
            <EntryForm day={day} drivers={drivers.filter((d) => d.is_active)} customers={customers} types={types} isAdmin={isAdmin} />
          )}
        </Tile>

        {/* Özet (sağda) */}
        <section style={order(6)} className="animate-rise flex flex-col overflow-hidden rounded-tile shadow-[0_24px_48px_-24px_rgba(120,20,20,0.4)] lg:col-span-5">
          <div className="relative overflow-hidden bg-debt p-5 text-white sm:p-6">
            <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/[0.08]" aria-hidden />
            <h2 className="relative flex items-center gap-2 font-display text-[1.05rem] font-semibold">
              <ReceiptText size={18} /> {periodName} toplam gideri
            </h2>
            <p className="relative mt-3 font-display tnum text-[2.6rem] leading-none font-semibold tracking-[-0.03em] sm:text-[3rem]">
              <AnimatedNumber value={totalCost} />
            </p>
            <p className="relative mt-2 text-[0.82rem] text-white/80">
              {from === to ? longDate(from) : `${shortDate(from)} – ${shortDate(to)}`}
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-4 bg-surface p-5 sm:p-6">
            {typeRows.length === 0 ? (
              <p className="py-4 text-center text-[0.85rem] text-ink-3">Bu dönemde gider yok.</p>
            ) : (
              <div>
                <p className="mb-2 text-[0.74rem] font-semibold tracking-wide text-ink-3 uppercase">Türe göre</p>
                <ul className="scroll-soft tnum flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                  {typeRows.map(([name, v]) => (
                    <li key={name} className="text-[0.88rem]">
                      <div className="flex justify-between gap-3">
                        <span className="truncate font-semibold">{name}</span>
                        <span className="font-semibold">{money(v)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-deep">
                        <div className="h-full rounded-full bg-debt/70" style={{ width: `${maxType ? Math.max(4, (v / maxType) * 100) : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {byPlace.size > 0 && (
              <div className="mt-auto border-t border-line pt-3">
                <p className="mb-1.5 text-[0.74rem] font-semibold tracking-wide text-ink-3 uppercase">Yere göre</p>
                <div className="tnum flex flex-wrap gap-1.5">
                  {[...byPlace].map(([k, v]) => (
                    <span key={k} className="rounded-full bg-bg-deep px-3 py-1 text-[0.8rem]">
                      <b className="font-semibold">{k}</b> {money(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Hareket tablosu */}
      <section style={order(7)} className="neu animate-rise rounded-tile">
        <div className="flex items-center justify-between gap-3 p-5 sm:p-6">
          <h2 className="flex items-center gap-2.5 font-display text-[1.15rem] font-semibold tracking-tight">
            <IconChip icon={Wallet} tone="amber" size="sm" /> Hareketler
          </h2>
          <span className="text-[0.82rem] text-ink-3">{expenses.length} kayıt · en yeni üstte</span>
        </div>
        {expenses.length === 0 ? (
          <p className="mx-5 mb-5 rounded-xl bg-bg-deep/60 px-3.5 py-3 text-[0.88rem] text-ink-2 sm:mx-6">Bu dönemde kayıt yok.</p>
        ) : (
          <>
            <div className={cx("hidden border-y border-line text-[0.76rem] font-semibold text-ink-3", GRID)}>
              <span className="flex items-center px-5 py-2.5">Tarih</span>
              <span className={cx(CELL, "py-2.5")}>Hesap</span>
              <span className={cx(CELL, "py-2.5")}>İşlem</span>
              <span className={cx(CELL, "py-2.5")}>Tür</span>
              <span className={cx(CELL, "py-2.5")}>Açıklama</span>
              <span className={cx(CELL, "py-2.5")}>Ödeme</span>
              <span className={cx(CELL, "justify-end py-2.5")}>Tutar</span>
              <span className={CELL} />
            </div>
            <ul className="scroll-soft flex flex-col gap-2 px-3 pb-3 sm:px-4 lg:max-h-[36rem] lg:gap-0 lg:overflow-y-auto lg:px-0 lg:pb-0">
              {expenses.map((e) => (
                <LedgerRow key={e.id} e={e} place={placeLabel(e)} customer={e.customer_id ? customer.get(e.customer_id) : undefined} locked={locked} />
              ))}
            </ul>
            <div className={cx("tnum flex flex-wrap justify-end gap-x-6 gap-y-1 border-t-2 border-ink/70 px-5 py-3 text-[0.88rem] sm:px-6")}>
              <span>
                Gider <b className="text-debt">{money(totalCost)}</b>
              </span>
              {onAccount > 0 && (
                <span>
                  Veresiye <b>{money(onAccount)}</b>
                </span>
              )}
              {paid > 0 && (
                <span>
                  Cari ödeme <b>{money(paid)}</b>
                </span>
              )}
              <span>
                Kasadan çıkan <b>{money(cashOut)}</b>
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function LedgerRow({ e, place, customer, locked }: { e: Expense; place: string; customer?: Customer; locked: boolean }) {
  const [pending, start] = useTransition();
  const isPayment = e.kind === "payment";
  return (
    <li
      className={cx(
        "rounded-xl bg-bg-deep/50 p-3 lg:min-h-11 lg:rounded-none lg:border-b lg:border-line lg:bg-transparent lg:p-0 lg:hover:bg-brand-soft/25",
        GRID,
        pending && "opacity-50",
      )}
    >
      <span className="tnum flex items-center text-[0.82rem] text-ink-2 lg:px-5">
        {shortDate(e.entry_date)} <span className="ml-1 text-ink-3">{weekdayShort(e.entry_date)}</span>
        <span className="ml-auto lg:hidden">
          <b className={cx("text-[1rem]", isPayment ? "text-sky" : "text-debt")}>{money(e.amount)}</b>
        </span>
      </span>
      <span className={cx("mt-1 min-w-0 truncate font-semibold lg:mt-0", CELL)}>
        {customer ? (
          <Link href={`/musteriler/${customer.id}`} className="truncate hover:text-brand-deep dark:hover:text-brand">
            {customer.name}
          </Link>
        ) : (
          place
        )}
      </span>
      <span className={cx("hidden", CELL)}>
        <span
          className={cx(
            "inline-flex w-[5.75rem] justify-center rounded-full px-2 py-1 text-[0.72rem] leading-none font-semibold",
            isPayment ? "bg-sky-500/12 text-sky-700 dark:text-sky-300" : "bg-debt-soft text-debt",
          )}
        >
          {isPayment ? "Cari ödeme" : "Gider"}
        </span>
      </span>
      <span className={cx("hidden min-w-0 truncate text-[0.88rem]", CELL)}>{e.category || "—"}</span>
      <span className={cx("block min-w-0 truncate text-[0.82rem] text-ink-3 lg:text-[0.88rem] lg:text-ink-2", CELL)}>
        <span className="lg:hidden">
          {isPayment ? "Cari ödeme" : e.category || "Gider"}
          {e.payment === "account" ? " · veresiye" : ""}
          {e.description ? " · " : ""}
        </span>
        {e.description || <span className="hidden lg:inline">—</span>}
        {customer && <span className="text-ink-3 lg:hidden"> · {place}</span>}
      </span>
      <span className={cx("hidden text-[0.82rem]", CELL)}>
        {isPayment ? "Nakit" : e.payment === "account" ? <b className="font-semibold text-amber">Veresiye</b> : "Peşin"}
      </span>
      <span className={cx("tnum hidden justify-end font-semibold", CELL, isPayment ? "text-sky" : "text-debt")}>{money(e.amount)}</span>
      <span className={cx("hidden justify-center lg:px-0", CELL)}>
        {!locked && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Bu kayıt silinsin mi?")) return;
              start(async () => {
                const res = await deleteExpense(e.id);
                if (res.ok) toast("Kayıt silindi.");
                else toast(res.error, "error");
              });
            }}
            className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-debt-soft hover:text-debt"
            aria-label="Kaydı sil"
          >
            <Trash2 size={16} />
          </button>
        )}
      </span>
    </li>
  );
}

function EntryForm({
  day,
  drivers,
  customers,
  types,
  isAdmin,
}: {
  day: string;
  drivers: Driver[];
  customers: Customer[];
  types: ExpenseType[];
  isAdmin: boolean;
}) {
  const [kind, setKind] = useState<"expense" | "payment">("expense");
  const [target, setTarget] = useState("general");
  const [customerText, setCustomerText] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [payment, setPayment] = useState<"cash" | "account">("cash");
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("");
  const [managing, setManaging] = useState(false);
  const [typePending, startType] = useTransition();

  const picked = customers.find((c) => c.id === customerId);
  const targets = [
    { value: "general", label: "Genel" },
    { value: "counter", label: "Tezgah" },
    ...drivers.map((d) => ({ value: `d:${d.id}`, label: d.name })),
  ];

  function clearCustomer() {
    setCustomerId(null);
    setCustomerText("");
    setPayment("cash");
    setKind("expense");
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const value = parseAmount(amount);
    if (!value || value <= 0) return toast("Tutarı yazın.", "error");
    if (kind === "payment" && !customerId) return toast("Ödeme yapılan cariyi seçin.", "error");
    const isDriver = kind === "expense" && target.startsWith("d:");
    start(async () => {
      const res = await addExpense({
        date: day,
        place: kind === "payment" ? "general" : isDriver ? "driver" : (target as "general" | "counter"),
        driverId: isDriver ? Number(target.slice(2)) : null,
        customerId,
        kind,
        payment: kind === "payment" ? "cash" : payment,
        amount: value,
        category: kind === "payment" ? null : category,
        description,
      });
      if (res.ok) {
        setAmount("");
        setDescription("");
        setKind("expense");
        toast(
          kind === "payment"
            ? `${picked?.name ?? "Cari"}: ${money(value)} ödeme kaydedildi.`
            : payment === "account"
              ? `${picked?.name ?? "Cari"} hesabına ${money(value)} alacak yazıldı.`
              : "Gider eklendi.",
        );
      } else toast(res.error, "error");
    });
  }

  function addType() {
    startType(async () => {
      const res = await createExpenseCategory(newType);
      if (res.ok) {
        setCategory(res.data ?? null);
        setNewType("");
        setAdding(false);
        toast("Gider türü eklendi.");
      } else toast(res.error, "error");
    });
  }

  function removeType(t: ExpenseType) {
    if (!window.confirm(`"${t.name}" gider türü listeden kaldırılsın mı? Eski kayıtlar etkilenmez.`)) return;
    startType(async () => {
      const res = await deleteExpenseCategory(t.id);
      if (res.ok) {
        if (category === t.name) setCategory(null);
        toast("Gider türü kaldırıldı.");
      } else toast(res.error, "error");
    });
  }

  const chip = (active: boolean) =>
    cx(
      "inline-flex min-h-9 items-center gap-1 rounded-full px-3.5 text-[0.84rem] font-semibold transition-all duration-200",
      active ? "brand-fill" : "bg-bg-deep text-ink-2 hover:text-ink",
    );
  const label = "mb-1.5 text-[0.8rem] font-semibold text-ink-2";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {kind === "expense" && (
        <div>
          <p className={label}>Kime / nereye ait</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gider yeri">
            {targets.map((t) => (
              <button key={t.value} type="button" aria-pressed={target === t.value} onClick={() => setTarget(t.value)} className={chip(target === t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cari */}
      <div>
        <p className={label}>Cari (isteğe bağlı) — kimden alındı?</p>
        {picked ? (
          <div className="flex min-h-12 items-center gap-3 rounded-control bg-brand-soft/60 px-3.5 ring-1 ring-brand/30">
            <span className="min-w-0 flex-1 truncate font-semibold">{picked.name}</span>
            <BalanceBadge value={picked.balance} />
            <button type="button" onClick={clearCustomer} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:text-ink" aria-label="Cariyi kaldır">
              <X size={15} />
            </button>
          </div>
        ) : (
          <Combobox
            value={customerText}
            onChange={setCustomerText}
            options={customers
              .filter((c) => c.is_active)
              .map((c) => ({ key: String(c.id), label: c.name, hint: c.balance ? money(Math.abs(c.balance)) + (c.balance > 0 ? " borçlu" : " alacaklı") : undefined }))}
            onPick={(o) => {
              setCustomerId(Number(o.key));
              setCustomerText("");
            }}
            placeholder={`Müşteri ara (${customers.length})`}
            ariaLabel="Cari ara"
            emptyText="Bu isimde müşteri yok. Önce Müşteriler'den ekleyin (ürün seçmeden)."
          />
        )}
        {picked && picked.balance < 0 && kind === "expense" && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-soft px-3.5 py-2.5">
            <span className="text-[0.86rem]">
              {picked.name}&apos;a borcumuz <b className="tnum">{money(-picked.balance)}</b>
            </span>
            <button
              type="button"
              onClick={() => {
                setKind("payment");
                setAmount(String(-picked.balance).replace(".", ","));
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[0.84rem] font-semibold text-ink ring-1 ring-edge hover:ring-brand"
            >
              <HandCoins size={15} /> Ödeme yap
            </button>
          </div>
        )}
        {kind === "payment" && picked && (
          <p className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-sky-500/10 px-3.5 py-2.5 text-[0.86rem]">
            <span>
              <b>{picked.name}</b>&apos;a ödeme — borcumuzdan düşülür, gider sayılmaz.
            </span>
            <button type="button" onClick={() => setKind("expense")} className="shrink-0 rounded-lg px-2 py-1 text-[0.8rem] font-semibold text-ink-3 hover:text-ink">
              Vazgeç
            </button>
          </p>
        )}
      </div>

      {kind === "expense" && (
        <div>
          <p className={label}>Ödeme</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ödeme şekli">
            <button type="button" aria-pressed={payment === "cash"} onClick={() => setPayment("cash")} className={cx(chip(payment === "cash"), "justify-center")}>
              Peşin ödendi
            </button>
            <button
              type="button"
              aria-pressed={payment === "account"}
              disabled={!picked}
              onClick={() => setPayment("account")}
              className={cx(chip(payment === "account"), "justify-center disabled:opacity-45")}
              title={picked ? undefined : "Veresiye için önce cari seçin"}
            >
              Veresiye (cariye yaz)
            </button>
          </div>
          {payment === "account" && picked && (
            <p className="mt-1.5 text-[0.78rem] text-ink-3">{picked.name} bu tutar kadar bizden alacaklı olur; ödeyince “Cariye ödeme” girin.</p>
          )}
        </div>
      )}

      {kind === "expense" && (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[0.8rem] font-semibold text-ink-2">Gider türü</p>
            {isAdmin && types.length > 0 && (
              <button
                type="button"
                onClick={() => setManaging((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.76rem] font-semibold text-ink-3 hover:bg-bg-deep hover:text-ink"
              >
                <Settings2 size={13} /> {managing ? "Bitti" : "Türleri düzenle"}
              </button>
            )}
          </div>
          <div className={cx("flex flex-wrap gap-1.5", typePending && "opacity-60")} role="group" aria-label="Gider türü">
            {types.map((t) =>
              managing ? (
                <button key={t.id} type="button" onClick={() => removeType(t)} className={cx(chip(false), "hover:bg-debt-soft hover:text-debt")}>
                  {t.name} <X size={13} />
                </button>
              ) : (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={category === t.name}
                  onClick={() => setCategory(category === t.name ? null : t.name)}
                  className={chip(category === t.name)}
                >
                  {t.name}
                </button>
              ),
            )}
            {!managing &&
              (adding ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-bg-deep p-1 pl-3">
                  <input
                    autoFocus
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (newType.trim()) addType();
                      }
                      if (e.key === "Escape") setAdding(false);
                    }}
                    maxLength={40}
                    placeholder="Yeni tür"
                    aria-label="Yeni gider türü"
                    className="w-28 bg-transparent text-[0.84rem] font-semibold outline-none"
                  />
                  <button type="button" disabled={!newType.trim() || typePending} onClick={addType} className="grid size-7 place-items-center rounded-full brand-fill disabled:opacity-50" aria-label="Türü ekle">
                    <Check size={14} strokeWidth={3} />
                  </button>
                  <button type="button" onClick={() => setAdding(false)} className="grid size-7 place-items-center rounded-full text-ink-3 hover:text-ink" aria-label="Vazgeç">
                    <X size={14} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-edge-strong px-3 text-[0.84rem] font-semibold text-ink-2 hover:border-brand hover:text-brand-deep"
                >
                  <Plus size={14} /> Tür ekle
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2.5">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
          inputMode="decimal"
          placeholder="Tutar ₺"
          aria-label="Tutar"
          className={cx(inputClass, "min-h-12 text-right text-[1.05rem] font-semibold")}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder={kind === "payment" ? "Açıklama (ör. Kasım odun ödemesi)" : "Açıklama (ör. 2 ton odun)"}
          aria-label="Açıklama"
          className={cx(inputClass, "min-h-12")}
        />
      </div>
      <Button type="submit" variant="primary" disabled={pending} className="min-h-12 w-full">
        <Plus size={18} /> {pending ? "Kaydediliyor…" : kind === "payment" ? "Ödemeyi kaydet" : payment === "account" ? "Cariye yaz" : "Gideri ekle"}
      </Button>
    </form>
  );
}
