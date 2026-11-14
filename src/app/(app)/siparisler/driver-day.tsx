"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet, Fuel, HandCoins, Plus, Trash2, Truck, Wallet } from "lucide-react";
import { toast } from "@/components/toast";
import { Button, IconChip, cx, inputClass } from "@/components/ui";
import { addExpense, deleteExpense, saveDriverHandover } from "@/lib/actions";
import { money, parseAmount, qty } from "@/lib/format";
import { downloadDriverReport } from "./day-export";

export type DayExpense = {
  id: number;
  entry_date: string;
  driver_id: number | null;
  amount: number;
  category: string | null;
  description: string | null;
};

type Row = {
  customer_name: string;
  delivered_qty: number;
  returned_qty: number;
  net: number;
  collection: number;
};

const CATEGORIES = ["Mazot", "Yemek", "Tamir", "Diğer"];

/** Bir dağıtıcının gün sonu: dağıttığı, topladığı, harcadığı ve teslim edeceği para. */
export function DriverDay({
  day,
  driver,
  rows,
  expenses,
  handedOver,
  locked,
}: {
  day: string;
  driver: { id: number; name: string; is_owner: boolean };
  rows: Row[];
  expenses: DayExpense[];
  handedOver: number | null;
  locked: boolean;
}) {
  const delivered = rows.reduce((a, r) => a + r.delivered_qty, 0);
  const returned = rows.reduce((a, r) => a + r.returned_qty, 0);
  const sales = rows.reduce((a, r) => a + r.net, 0);
  const collected = rows.reduce((a, r) => a + r.collection, 0);
  const spent = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const toHand = collected - spent;

  const [handed, setHanded] = useState(handedOver == null ? "" : String(handedOver).replace(".", ","));
  const [savedHanded, setSavedHanded] = useState(handedOver);
  const handedValue = handed.trim() === "" ? null : parseAmount(handed);
  const diff = handedValue == null ? null : handedValue - toHand;

  const [exporting, startExport] = useTransition();

  async function commitHanded() {
    const v = handed.trim() === "" ? null : parseAmount(handed);
    if (v === savedHanded) return;
    const res = await saveDriverHandover(day, driver.id, v);
    if (res.ok) {
      setSavedHanded(v);
      toast("Teslim alınan para kaydedildi.");
    } else toast(res.error, "error");
  }

  function exportReport() {
    startExport(async () => {
      try {
        await downloadDriverReport(
          day,
          driver.name,
          rows.map((r) => ({
            name: r.customer_name,
            delivered: r.delivered_qty,
            returned: r.returned_qty,
            net: r.net,
            collection: r.collection,
          })),
          expenses.map((e) => ({ category: e.category, description: e.description, amount: Number(e.amount) })),
          handedValue,
        );
        toast(`${driver.name} hesabı indirildi.`);
      } catch {
        toast("Hesap oluşturulamadı. Tekrar deneyin.", "error");
      }
    });
  }

  const title = driver.is_owner ? "Benim gün sonum" : `${driver.name} — gün sonu`;

  return (
    <section className="m-3 mt-4 rounded-2xl border border-edge p-4 sm:m-4 sm:p-5 xl:m-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2.5 font-display text-[1.1rem] font-semibold">
          <IconChip icon={Truck} tone="sky" size="sm" /> {title}
        </h3>
        <Button onClick={exportReport} disabled={exporting} className="min-h-11">
          <FileSpreadsheet size={17} className="text-brand-deep dark:text-brand" />
          {exporting ? "Hazırlanıyor…" : "Hesabı çıkar"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        {/* Özet */}
        <dl className="tnum grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-bg-deep/60 p-4 text-[0.92rem]">
          <Item label="Dağıtılan ekmek" value={`${qty(delivered)} adet`} />
          <Item label="İade alınan" value={`${qty(returned)} adet`} />
          <Item label="Satış tutarı" value={money(sales)} />
          <Item label="Toplanan para" value={money(collected)} strong />
          <Item label="Giderler" value={spent ? `− ${money(spent)}` : "—"} tone={spent ? "debt" : undefined} />
          <div className="col-span-2 mt-1 flex items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-3 ring-1 ring-edge">
            <span className="flex items-center gap-2 font-semibold">
              <Wallet size={17} className="text-brand-deep dark:text-brand" /> Teslim edilecek
            </span>
            <span className="font-display text-[1.35rem] font-semibold text-brand-deep dark:text-brand">{money(toHand)}</span>
          </div>
          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-ink-2">
              <HandCoins size={14} /> Teslim alınan para (isteğe bağlı)
            </span>
            <span className="flex items-center gap-3">
              <input
                value={handed}
                readOnly={locked}
                inputMode="decimal"
                placeholder={money(toHand)}
                onChange={(e) => setHanded(e.target.value.replace(/[^\d.,]/g, ""))}
                onBlur={commitHanded}
                className={cx(inputClass, "max-w-48 text-right font-semibold")}
                aria-label="Teslim alınan para"
              />
              {diff != null && (
                <span
                  className={cx(
                    "rounded-full px-2.5 py-1 text-[0.8rem] font-bold",
                    Math.abs(diff) < 0.005 ? "bg-credit-soft text-credit" : diff < 0 ? "bg-debt-soft text-debt" : "bg-sky-soft text-sky",
                  )}
                >
                  {Math.abs(diff) < 0.005 ? "Tam" : diff < 0 ? `${money(-diff)} eksik` : `${money(diff)} fazla`}
                </span>
              )}
            </span>
          </label>
        </dl>

        {/* Giderler */}
        <ExpenseList day={day} driverId={driver.id} expenses={expenses} locked={locked} />
      </div>
    </section>
  );
}

function Item({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "debt" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.76rem] font-semibold text-ink-3">{label}</dt>
      <dd className={cx("truncate font-semibold", strong && "text-[1.05rem]", tone === "debt" && "text-debt")}>{value}</dd>
    </div>
  );
}

/** Gider satırları + ekleme formu. Şoför ve tezgah aynı bileşeni kullanır. */
export function ExpenseList({
  day,
  driverId,
  expenses,
  locked,
  place = "driver",
}: {
  day: string;
  driverId: number | null;
  expenses: DayExpense[];
  locked: boolean;
  place?: "driver" | "counter";
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string | null>("Mazot");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();
  const [removing, startRemove] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!value || value <= 0) {
      toast("Gider tutarını yazın.", "error");
      return;
    }
    start(async () => {
      const res = await addExpense({ date: day, place, driverId, amount: value, category, description });
      if (res.ok) {
        setAmount("");
        setDescription("");
        toast("Gider eklendi.");
      } else toast(res.error, "error");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-[0.9rem] font-semibold">
        <Fuel size={16} className="text-amber" /> Giderler
        {expenses.length > 0 && (
          <span className="ml-auto tnum text-[0.85rem] text-debt">
            Toplam {money(expenses.reduce((a, x) => a + Number(x.amount), 0))}
          </span>
        )}
      </p>

      {expenses.length === 0 ? (
        <p className="rounded-xl bg-bg-deep/60 px-3.5 py-3 text-[0.88rem] text-ink-2">Bugün gider yazılmadı.</p>
      ) : (
        <ul className="scroll-soft flex flex-col gap-2 lg:max-h-[18rem] lg:overflow-y-auto lg:pr-1">
          {expenses.map((x) => (
            <li key={x.id} className="flex items-center gap-3 rounded-xl bg-bg-deep/60 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{x.description || x.category || "Gider"}</span>
                {x.description && x.category && <span className="text-[0.76rem] text-ink-3">{x.category}</span>}
              </span>
              <span className="tnum font-semibold text-debt">{money(Number(x.amount))}</span>
              {!locked && (
                <button
                  type="button"
                  disabled={removing}
                  onClick={() =>
                    startRemove(async () => {
                      const res = await deleteExpense(x.id);
                      if (res.ok) toast("Gider silindi.");
                      else toast(res.error, "error");
                    })
                  }
                  className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-debt-soft hover:text-debt"
                  aria-label={`${x.description || x.category || "Gider"} gideri sil`}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-xl border border-dashed border-edge-strong p-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gider türü">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(category === c ? null : c)}
                className={cx(
                  "rounded-full px-3 py-1.5 text-[0.82rem] font-semibold transition-all duration-200",
                  category === c ? "brand-fill" : "bg-bg-deep text-ink-2 hover:text-ink",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
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
      )}
    </div>
  );
}
