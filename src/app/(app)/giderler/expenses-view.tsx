"use client";

import { useState, useTransition } from "react";
import { Building2, Lock, Plus, ReceiptText, Store, Trash2, Truck } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { toast } from "@/components/toast";
import { Button, IconChip, Tile, TileTitle, cx, inputClass } from "@/components/ui";
import { addExpense, deleteExpense } from "@/lib/actions";
import { money, parseAmount } from "@/lib/format";

export type Expense = {
  id: number;
  place: "driver" | "counter" | "general";
  driver_id: number | null;
  amount: number;
  category: string | null;
  description: string | null;
};
type Driver = { id: number; name: string; is_active: boolean };

/** "general" | "counter" | "d:<id>" */
type Target = string;

const CATEGORIES = ["Mazot", "Yemek", "Elektrik", "Kira", "Malzeme", "Tamir", "Maaş", "Diğer"];

export function ExpensesView({
  day,
  expenses,
  drivers,
  locked,
}: {
  day: string;
  expenses: Expense[];
  drivers: Driver[];
  locked: boolean;
}) {
  const driverName = new Map(drivers.map((d) => [d.id, d.name]));
  const whereLabel = (e: Expense) =>
    e.place === "general" ? "Genel" : e.place === "counter" ? "Tezgah" : (driverName.get(e.driver_id ?? 0) ?? "Dağıtıcı");

  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const groups = new Map<string, number>();
  for (const e of expenses) groups.set(whereLabel(e), (groups.get(whereLabel(e)) ?? 0) + e.amount);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {locked && (
        <p className="flex items-center gap-2 rounded-2xl bg-bg-deep px-4 py-3 text-[0.9rem] font-medium text-ink-2">
          <Lock size={16} /> Geçmiş hafta kilitli; yalnızca görüntülenir.
        </p>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-12">
        <section className="neu animate-rise rounded-tile p-5 sm:p-7 lg:col-span-5">
          <h2 className="flex items-center gap-2.5 font-display text-[1.1rem] font-semibold">
            <IconChip icon={ReceiptText} tone="debt" size="sm" /> Günün toplam gideri
          </h2>
          <p className="mt-4 font-display tnum text-[2.6rem] leading-none font-semibold tracking-[-0.03em] text-debt sm:text-[3.2rem]">
            <AnimatedNumber value={total} />
          </p>
          {groups.size > 0 && (
            <dl className="mt-5 flex flex-col gap-2 rounded-2xl bg-bg-deep/60 p-4 text-[0.92rem]">
              {[...groups].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="tnum font-semibold">{money(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <Tile i={1} className="lg:col-span-7">
          <TileTitle icon={<IconChip icon={ReceiptText} tone="amber" size="sm" />}>Gider kalemleri</TileTitle>
          {expenses.length === 0 ? (
            <p className="rounded-xl bg-bg-deep/60 px-3.5 py-3 text-[0.88rem] text-ink-2">Bu gün gider yazılmadı.</p>
          ) : (
            <ul className="scroll-soft flex flex-col gap-2 lg:max-h-[26rem] lg:overflow-y-auto lg:pr-1">
              {expenses.map((e) => (
                <ExpenseRow key={e.id} expense={e} where={whereLabel(e)} locked={locked} />
              ))}
            </ul>
          )}
          {!locked && <AddExpense day={day} drivers={drivers.filter((d) => d.is_active)} />}
        </Tile>
      </div>
    </div>
  );
}

function ExpenseRow({ expense: e, where, locked }: { expense: Expense; where: string; locked: boolean }) {
  const [pending, start] = useTransition();
  const Icon = e.place === "general" ? Building2 : e.place === "counter" ? Store : Truck;
  return (
    <li className={cx("flex items-center gap-3 rounded-xl bg-bg-deep/60 px-3.5 py-2.5", pending && "opacity-50")}>
      <Icon size={17} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{e.description || e.category || "Gider"}</span>
        <span className="text-[0.76rem] text-ink-3">
          {where}
          {e.description && e.category ? ` · ${e.category}` : ""}
        </span>
      </span>
      <span className="tnum font-semibold text-debt">{money(e.amount)}</span>
      {!locked && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteExpense(e.id);
              if (res.ok) toast("Gider silindi.");
              else toast(res.error, "error");
            })
          }
          className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-debt-soft hover:text-debt"
          aria-label="Gideri sil"
        >
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}

function AddExpense({ day, drivers }: { day: string; drivers: Driver[] }) {
  const [target, setTarget] = useState<Target>("general");
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();

  const targets: Array<{ value: Target; label: string }> = [
    { value: "general", label: "Genel" },
    { value: "counter", label: "Tezgah" },
    ...drivers.map((d) => ({ value: `d:${d.id}`, label: d.name })),
  ];

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const value = parseAmount(amount);
    if (!value || value <= 0) return toast("Gider tutarını yazın.", "error");
    const isDriver = target.startsWith("d:");
    start(async () => {
      const res = await addExpense({
        date: day,
        place: isDriver ? "driver" : (target as "general" | "counter"),
        driverId: isDriver ? Number(target.slice(2)) : null,
        amount: value,
        category,
        description,
      });
      if (res.ok) {
        setAmount("");
        setDescription("");
        toast("Gider eklendi.");
      } else toast(res.error, "error");
    });
  }

  const chip = (active: boolean) =>
    cx(
      "rounded-full px-3 py-1.5 text-[0.82rem] font-semibold transition-all duration-200",
      active ? "brand-fill" : "bg-bg-deep text-ink-2 hover:text-ink",
    );

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-edge-strong p-3 sm:p-4">
      <div>
        <p className="mb-1.5 text-[0.78rem] font-semibold text-ink-3">Kime / nereye ait</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gider yeri">
          {targets.map((t) => (
            <button key={t.value} type="button" aria-pressed={target === t.value} onClick={() => setTarget(t.value)} className={chip(target === t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[0.78rem] font-semibold text-ink-3">Tür (isteğe bağlı)</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gider türü">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)} className={chip(category === c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
          inputMode="decimal"
          placeholder="Tutar ₺"
          aria-label="Gider tutarı"
          className={cx(inputClass, "text-right font-semibold")}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder="Açıklama (ör. Shell, 40 lt)"
          aria-label="Gider açıklaması"
          className={inputClass}
        />
        <Button type="submit" variant="primary" disabled={pending} className="col-span-2 sm:col-span-1">
          <Plus size={18} /> {pending ? "Ekleniyor…" : "Gider ekle"}
        </Button>
      </div>
    </form>
  );
}
