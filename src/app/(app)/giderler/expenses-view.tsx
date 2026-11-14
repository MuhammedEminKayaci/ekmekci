"use client";

import { useState, useTransition } from "react";
import { Check, Lock, Plus, ReceiptText, Settings2, Trash2, X } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { toast } from "@/components/toast";
import { Button, IconChip, Tile, TileTitle, cx, inputClass } from "@/components/ui";
import { addExpense, createExpenseCategory, deleteExpense, deleteExpenseCategory } from "@/lib/actions";
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
type ExpenseType = { id: number; name: string };

/** "general" | "counter" | "d:<id>" */
type Target = string;

export function ExpensesView({
  day,
  expenses,
  drivers,
  types,
  isAdmin,
  locked,
}: {
  day: string;
  expenses: Expense[];
  drivers: Driver[];
  types: ExpenseType[];
  isAdmin: boolean;
  locked: boolean;
}) {
  const driverName = new Map(drivers.map((d) => [d.id, d.name]));
  const whereLabel = (e: Expense) =>
    e.place === "general" ? "Genel" : e.place === "counter" ? "Tezgah" : (driverName.get(e.driver_id ?? 0) ?? "Dağıtıcı");

  const total = expenses.reduce((a, e) => a + e.amount, 0);
  // Fişte: önce yer (Genel, Tezgah, dağıtıcılar), altında kalemler.
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) groups.set(whereLabel(e), [...(groups.get(whereLabel(e)) ?? []), e]);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {locked && (
        <p className="flex items-center gap-2 rounded-2xl bg-bg-deep px-4 py-3 text-[0.9rem] font-medium text-ink-2">
          <Lock size={16} /> Geçmiş hafta kilitli; yalnızca görüntülenir.
        </p>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
        {/* Toplam: fiş görünümü (sağda) */}
        <section className="animate-rise order-first flex flex-col overflow-hidden rounded-tile shadow-[0_24px_48px_-24px_rgba(120,20,20,0.4)] lg:order-none lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:min-h-[34rem]">
          <div className="relative overflow-hidden bg-debt p-5 text-white sm:p-7">
            <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/[0.08]" aria-hidden />
            <h2 className="relative flex items-center gap-2 font-display text-[1.1rem] font-semibold">
              <ReceiptText size={19} /> Günün toplam gideri
            </h2>
            <p className="relative mt-4 font-display tnum text-[2.9rem] leading-none font-semibold tracking-[-0.03em] sm:text-[3.5rem]">
              <AnimatedNumber value={total} />
            </p>
            <p className="relative mt-2 text-[0.85rem] text-white/80">
              {expenses.length === 0 ? "Henüz gider yok" : `${expenses.length} kalem · ${groups.size} yer`}
            </p>
          </div>

          <div className="flex flex-1 flex-col bg-surface p-5 sm:p-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-line pb-2 text-[0.74rem] font-semibold tracking-wide text-ink-3 uppercase">
              <span>Kalem</span>
              <span className="min-w-[5.5rem] text-right">Tutar</span>
            </div>
            {expenses.length === 0 ? (
              <p className="py-6 text-center text-[0.85rem] text-ink-3">Soldan gider girince burada listelenir.</p>
            ) : (
              <div className="scroll-soft tnum flex flex-col lg:max-h-[24rem] lg:overflow-y-auto lg:pr-1">
                {[...groups].map(([place, list]) => (
                  <div key={place} className="border-b border-line py-2">
                    <div className="flex justify-between gap-3 py-1 text-[0.8rem] font-semibold text-ink-2">
                      <span>{place}</span>
                      <span>{money(list.reduce((a, e) => a + e.amount, 0))}</span>
                    </div>
                    <ul>
                      {list.map((e) => (
                        <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-1.5 text-[0.92rem]">
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{e.category || "Gider"}</span>
                            {e.description && <span className="text-ink-3"> · {e.description}</span>}
                          </span>
                          <span className="min-w-[5.5rem] text-right font-semibold">{money(e.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto pt-5">
              <div className="tnum flex items-baseline justify-between gap-3 border-t-2 border-ink/80 pt-3">
                <span className="font-display text-[1.05rem] font-semibold">Toplam</span>
                <span className="font-display text-[1.6rem] font-semibold text-debt">{money(total)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Gider gir (solda) */}
        <Tile i={1} className="lg:col-span-7 lg:col-start-1 lg:row-start-1">
          <TileTitle icon={<IconChip icon={Plus} tone="brand" size="sm" />}>Gider gir</TileTitle>
          {locked ? (
            <p className="rounded-xl bg-bg-deep/60 px-3.5 py-3 text-[0.88rem] text-ink-2">Bu gün kilitli; gider girilemez.</p>
          ) : (
            <AddExpense day={day} drivers={drivers.filter((d) => d.is_active)} types={types} isAdmin={isAdmin} />
          )}
        </Tile>

        {/* Kalemler (silme) */}
        <Tile i={2} className="flex flex-col lg:col-span-7 lg:col-start-1 lg:row-start-2">
          <TileTitle icon={<IconChip icon={ReceiptText} tone="amber" size="sm" />}>Girilen giderler</TileTitle>
          {expenses.length === 0 ? (
            <p className="rounded-xl bg-bg-deep/60 px-3.5 py-3 text-[0.88rem] text-ink-2">Bu gün gider yazılmadı.</p>
          ) : (
            <ul className="scroll-soft flex flex-col gap-2 lg:max-h-[22rem] lg:overflow-y-auto lg:pr-1">
              {expenses.map((e) => (
                <ExpenseRow key={e.id} expense={e} where={whereLabel(e)} locked={locked} />
              ))}
            </ul>
          )}
        </Tile>
      </div>
    </div>
  );
}

function ExpenseRow({ expense: e, where, locked }: { expense: Expense; where: string; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <li className={cx("flex items-center gap-3 rounded-xl bg-bg-deep/60 px-3.5 py-2.5", pending && "opacity-50")}>
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

function AddExpense({ day, drivers, types, isAdmin }: { day: string; drivers: Driver[]; types: ExpenseType[]; isAdmin: boolean }) {
  const [target, setTarget] = useState<Target>("general");
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("");
  const [managing, setManaging] = useState(false);
  const [typePending, startType] = useTransition();

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
    if (!window.confirm(`"${t.name}" gider türü listeden kaldırılsın mı? Eski giderler etkilenmez.`)) return;
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

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-[0.8rem] font-semibold text-ink-2">Kime / nereye ait</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gider yeri">
          {targets.map((t) => (
            <button key={t.value} type="button" aria-pressed={target === t.value} onClick={() => setTarget(t.value)} className={chip(target === t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
                <button
                  type="button"
                  disabled={!newType.trim() || typePending}
                  onClick={addType}
                  className="grid size-7 place-items-center rounded-full brand-fill disabled:opacity-50"
                  aria-label="Türü ekle"
                >
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

      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2.5">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
          inputMode="decimal"
          placeholder="Tutar ₺"
          aria-label="Gider tutarı"
          className={cx(inputClass, "min-h-12 text-right text-[1.05rem] font-semibold")}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder="Açıklama (ör. Shell, 40 lt)"
          aria-label="Gider açıklaması"
          className={cx(inputClass, "min-h-12")}
        />
      </div>
      <Button type="submit" variant="primary" disabled={pending} className="min-h-12 w-full">
        <Plus size={18} /> {pending ? "Ekleniyor…" : "Gideri ekle"}
      </Button>
    </form>
  );
}
