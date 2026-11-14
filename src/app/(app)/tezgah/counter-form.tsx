"use client";

import { useState, useTransition } from "react";
import { Check, FileSpreadsheet, Lock, Moon, Sun, Wallet } from "lucide-react";
import { toast } from "@/components/toast";
import { Button, IconChip, Tile, TileTitle, cx, inputClass } from "@/components/ui";
import { saveCounterDay, setCounterDefaultPrice } from "@/lib/actions";
import { money, parseAmount, qty } from "@/lib/format";
import { ExpenseList, type DayExpense } from "../siparisler/driver-day";
import { counterMath, downloadCounterReport } from "./counter-export";

export type CounterDay = {
  opening_cash: number;
  breads_in: number;
  breads_left: number;
  bread_price: number | null;
  sales_income: number;
  closing_cash: number;
  handed_over: number | null;
  note: string | null;
};

type Field = keyof Omit<CounterDay, "note">;

const toText = (v: number | null) => (v == null || v === 0 ? "" : Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));

export function CounterForm({
  day,
  initial,
  defaultPrice,
  expenses,
  locked,
  isAdmin,
}: {
  day: string;
  initial: CounterDay;
  defaultPrice: number | null;
  expenses: DayExpense[];
  locked: boolean;
  isAdmin: boolean;
}) {
  const [text, setText] = useState<Record<Field, string>>({
    opening_cash: toText(initial.opening_cash),
    breads_in: toText(initial.breads_in),
    breads_left: toText(initial.breads_left),
    bread_price: toText(initial.bread_price),
    sales_income: toText(initial.sales_income),
    closing_cash: toText(initial.closing_cash),
    handed_over: toText(initial.handed_over),
  });
  const [note, setNote] = useState(initial.note ?? "");
  const [saved, setSaved] = useState(JSON.stringify({ ...initial, note: initial.note ?? "" }));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [exporting, startExport] = useTransition();

  const num = (f: Field) => parseAmount(text[f]) ?? 0;
  const values: CounterDay = {
    opening_cash: num("opening_cash"),
    breads_in: Math.trunc(num("breads_in")),
    breads_left: Math.trunc(num("breads_left")),
    bread_price: text.bread_price.trim() ? num("bread_price") : null,
    sales_income: num("sales_income"),
    closing_cash: num("closing_cash"),
    handed_over: text.handed_over.trim() ? num("handed_over") : null,
    note: note.trim() || null,
  };
  const spent = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const m = counterMath({
    openingCash: values.opening_cash,
    breadsIn: values.breads_in,
    breadsLeft: values.breads_left,
    breadPrice: values.bread_price,
    salesIncome: values.sales_income,
    closingCash: values.closing_cash,
    handedOver: values.handed_over,
    spent,
  });

  async function commit() {
    const snapshot = JSON.stringify({ ...values, note: note.trim() });
    if (snapshot === saved || locked) return;
    setState("saving");
    const res = await saveCounterDay(day, values);
    if (res.ok) {
      setSaved(snapshot);
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1600);
    } else {
      setState("idle");
      toast(res.error, "error");
    }
  }

  async function makeDefault() {
    if (!values.bread_price) return;
    const res = await setCounterDefaultPrice(values.bread_price);
    if (res.ok) toast(`Tezgah fiyatı ${money(values.bread_price)} olarak varsayılan yapıldı.`);
    else toast(res.error, "error");
  }

  function exportReport() {
    startExport(async () => {
      try {
        await downloadCounterReport(day, {
          openingCash: values.opening_cash,
          breadsIn: values.breads_in,
          breadsLeft: values.breads_left,
          breadPrice: values.bread_price,
          salesIncome: values.sales_income,
          closingCash: values.closing_cash,
          handedOver: values.handed_over,
          note: values.note,
          expenses: expenses.map((e) => ({ category: e.category, description: e.description, amount: Number(e.amount) })),
        });
        toast("Tezgah gün sonu indirildi.");
      } catch {
        toast("Çıktı oluşturulamadı. Tekrar deneyin.", "error");
      }
    });
  }

  const box = (f: Field, label: string, unit: string, hint?: string, decimal = true) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.85rem] font-semibold text-ink-2">{label}</span>
      <span className="relative block">
        <input
          value={text[f]}
          readOnly={locked}
          inputMode={decimal ? "decimal" : "numeric"}
          placeholder="0"
          autoComplete="off"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText((t) => ({ ...t, [f]: e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, "") }))}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={cx(inputClass, "min-h-[3.25rem] pl-12 text-right text-[1.1rem] font-semibold", locked && "bg-transparent shadow-none")}
        />
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[0.75rem] font-semibold text-ink-3">
          {unit}
        </span>
      </span>
      {hint && <span className="text-[0.78rem] text-ink-3">{hint}</span>}
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex h-6 items-center gap-1.5 text-[0.88rem] text-ink-2">
          {locked ? (
            <>
              <Lock size={14} /> Geçmiş hafta. Kayıtlar sadece görüntülenir.
            </>
          ) : state === "saving" ? (
            "Kaydediliyor…"
          ) : state === "saved" ? (
            <span className="animate-pop inline-flex items-center gap-1 font-semibold text-brand-deep dark:text-brand">
              <Check size={15} strokeWidth={3} /> Kaydedildi
            </span>
          ) : (
            "Yazdıklarınız otomatik kaydedilir."
          )}
        </p>
        <Button onClick={exportReport} disabled={exporting}>
          <FileSpreadsheet size={18} className="text-brand-deep dark:text-brand" />
          {exporting ? "Hazırlanıyor…" : "A4 çıktı al"}
        </Button>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Tile i={1}>
          <TileTitle icon={<IconChip icon={Sun} tone="amber" size="sm" />}>Sabah</TileTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {box("opening_cash", "Kasadaki para", "₺", "Güne başlarken kasada olan")}
            {box("breads_in", "Tezgaha konan ekmek", "adet", undefined, false)}
            <div className="sm:col-span-2">
              {box("bread_price", "Tezgah ekmek fiyatı", "₺")}
              {!locked && isAdmin && values.bread_price != null && values.bread_price !== defaultPrice && (
                <button
                  type="button"
                  onClick={makeDefault}
                  className="mt-1.5 rounded-lg px-2 py-1 text-[0.8rem] font-semibold text-brand-deep hover:bg-brand-soft dark:text-brand"
                >
                  Bu fiyatı her gün için varsayılan yap
                </button>
              )}
            </div>
          </div>
        </Tile>

        <Tile i={2}>
          <TileTitle icon={<IconChip icon={Moon} tone="sky" size="sm" />}>Akşam</TileTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {box("breads_left", "Kalan ekmek", "adet", undefined, false)}
            {box("sales_income", "Gün içi gelen para", "₺", "Satıştan toplanan")}
            <div className="sm:col-span-2">{box("closing_cash", "Kasada bırakılan para", "₺", "Ertesi güne kasada kalan")}</div>
          </div>
        </Tile>

        <Tile i={3}>
          <ExpenseList day={day} driverId={null} place="counter" expenses={expenses} locked={locked} />
        </Tile>

        {/* Sonuç */}
        <section className="brand-fill animate-rise rounded-tile p-5 sm:p-6" style={{ ["--i" as string]: 4 }}>
          <h2 className="mb-4 flex items-center gap-2 font-display text-[1.1rem] font-semibold">
            <Wallet size={18} /> Gün sonu hesabı
          </h2>
          <dl className="tnum grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-white/12 p-4 ring-1 ring-white/15">
            <Row label="Satılan ekmek" value={`${qty(m.sold)} adet`} />
            <Row label="Beklenen satış" value={m.expected == null ? "Fiyat yok" : money(m.expected)} />
            <Row label="Gelen para" value={money(values.sales_income)} />
            <Row
              label={m.cashGap == null ? "Kasa farkı" : m.cashGap < -0.004 ? "Kasa açığı" : m.cashGap > 0.004 ? "Kasa fazlası" : "Kasa"}
              value={m.cashGap == null ? "—" : Math.abs(m.cashGap) < 0.005 ? "Tam" : money(Math.abs(m.cashGap))}
              warn={m.cashGap != null && m.cashGap < -0.004}
            />
            <Row label="Giderler" value={spent ? `− ${money(spent)}` : "—"} />
            <Row label="Kasada bırakılan" value={`− ${money(values.closing_cash)}`} />
          </dl>
          <div className="mt-4 flex items-end justify-between gap-3">
            <span className="text-[0.9rem] font-semibold text-white/85">Teslim edilecek</span>
            <span className="font-display text-[2.2rem] leading-none font-semibold">{money(m.toHand)}</span>
          </div>
          <p className="mt-1 text-right text-[0.75rem] text-white/70">Sabah kasa + gelen para − giderler − kasada bırakılan</p>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[0.85rem] font-semibold text-white/85">Teslim alınan para (isteğe bağlı)</span>
            <span className="flex items-center gap-3">
              <input
                value={text.handed_over}
                readOnly={locked}
                inputMode="decimal"
                placeholder={money(m.toHand)}
                onChange={(e) => setText((t) => ({ ...t, handed_over: e.target.value.replace(/[^\d.,]/g, "") }))}
                onBlur={commit}
                className="min-h-12 w-full max-w-52 rounded-control bg-white px-4 text-right text-[1.05rem] font-semibold text-[#0a3d22] outline-none placeholder:text-[#0a3d22]/40 focus:ring-2 focus:ring-white"
                aria-label="Teslim alınan para"
              />
              {m.handDiff != null && (
                <span className="rounded-full bg-white/20 px-3 py-1 text-[0.85rem] font-bold">
                  {Math.abs(m.handDiff) < 0.005 ? "Tam" : m.handDiff < 0 ? `${money(-m.handDiff)} eksik` : `${money(m.handDiff)} fazla`}
                </span>
              )}
            </span>
          </label>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[0.85rem] font-semibold text-white/85">Not</span>
            <textarea
              value={note}
              readOnly={locked}
              onChange={(e) => setNote(e.target.value)}
              onBlur={commit}
              rows={2}
              maxLength={500}
              placeholder="Örn. öğlen 50 ekmek daha geldi"
              className="resize-none rounded-control bg-white/12 px-4 py-2.5 text-white outline-none ring-1 ring-white/20 placeholder:text-white/50 focus:ring-2 focus:ring-white"
            />
          </label>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.75rem] font-semibold text-white/75">{label}</dt>
      <dd className={cx("truncate font-semibold", warn && "rounded-md bg-[#c9283f] px-1.5 text-white")}>{value}</dd>
    </div>
  );
}
