"use client";

import { useState, useTransition } from "react";
import { Check, FileSpreadsheet, Lock, Minus, Plus, ShoppingBasket, Store, Trash2, Wheat } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { toast } from "@/components/toast";
import { Button, IconChip, Tile, TileTitle, cx, inputClass } from "@/components/ui";
import { addCounterSale, deleteCounterSale, saveCounterBread } from "@/lib/actions";
import { money, parseAmount, qty } from "@/lib/format";
import { downloadCounterReport } from "./counter-export";

export type CounterSale = { id: number; name: string; qty: number; unit_price: number; amount: number };
type Pick = { name: string; price: number | null };

const toText = (v: number | null) => (v == null || v === 0 ? "" : Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));

/** Tezgah: ekmek parası + ek ürün satışları = günün tezgah toplamı. */
export function CounterView({
  day,
  bread,
  sales,
  picks,
  locked,
}: {
  day: string;
  bread: number;
  sales: CounterSale[];
  picks: Pick[];
  locked: boolean;
}) {
  const [breadText, setBreadText] = useState(toText(bread));
  const [savedBread, setSavedBread] = useState(bread);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  // Başka bir cihazdan değişince (canlı güncelleme) kutu da güncellensin.
  const [prevBread, setPrevBread] = useState(bread);
  if (bread !== prevBread) {
    setPrevBread(bread);
    setSavedBread(bread);
    setBreadText(toText(bread));
  }
  const [exporting, startExport] = useTransition();

  const breadValue = parseAmount(breadText) ?? 0;
  const itemsTotal = sales.reduce((a, s) => a + s.amount, 0);
  const total = breadValue + itemsTotal;

  // Fişte aynı ürün tek satır: 2 + 1 zeytinyağı → 3 zeytinyağı.
  const grouped = new Map<string, { name: string; qty: number; amount: number; prices: Set<number> }>();
  for (const x of sales) {
    const g = grouped.get(x.name) ?? { name: x.name, qty: 0, amount: 0, prices: new Set<number>() };
    g.qty += x.qty;
    g.amount += x.amount;
    g.prices.add(x.unit_price);
    grouped.set(x.name, g);
  }
  const lines = [...grouped.values()].map((g) => ({
    ...g,
    prices: [...g.prices].map((p) => `tanesi ${money(p)}`).join(" / "),
  }));
  const itemCount = sales.reduce((a, x) => a + x.qty, 0);

  async function commitBread() {
    if (locked || breadValue === savedBread) return;
    setState("saving");
    const res = await saveCounterBread(day, breadValue);
    if (res.ok) {
      setSavedBread(breadValue);
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1600);
    } else {
      setState("idle");
      toast(res.error, "error");
    }
  }

  function exportReport() {
    startExport(async () => {
      try {
        await downloadCounterReport(day, { bread: breadValue, sales });
        toast("Tezgah çıktısı indirildi.");
      } catch {
        toast("Çıktı oluşturulamadı. Tekrar deneyin.", "error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {locked && (
        <p className="flex items-center gap-2 rounded-2xl bg-bg-deep px-4 py-3 text-[0.9rem] font-medium text-ink-2">
          <Lock size={16} /> Geçmiş hafta kilitli; yalnızca görüntülenir.
        </p>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-12">
        {/* Toplam: fiş görünümü */}
        <section className="animate-rise order-first flex flex-col overflow-hidden rounded-tile shadow-[0_24px_48px_-24px_rgba(8,60,32,0.45)] lg:order-last lg:col-span-5 lg:row-span-2 lg:min-h-[34rem]">
          <div className="brand-fill relative overflow-hidden p-5 sm:p-7">
            <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/[0.07]" aria-hidden />
            <div className="relative flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-[1.1rem] font-semibold">
                <Store size={19} /> Tezgah toplamı
              </h2>
              <span className="flex h-6 items-center gap-1 text-[0.8rem] font-semibold text-white/85">
                {state === "saving" && "Kaydediliyor…"}
                {state === "saved" && (
                  <>
                    <Check size={14} /> Kaydedildi
                  </>
                )}
              </span>
            </div>
            <p className="relative mt-4 font-display tnum text-[2.9rem] leading-none font-semibold tracking-[-0.03em] sm:text-[3.5rem]">
              <AnimatedNumber value={total} />
            </p>
            <p className="relative mt-2 text-[0.85rem] text-white/80">
              {sales.length === 0 ? "Yalnızca ekmek" : `Ekmek + ${lines.length} çeşit ek ürün (${qty(itemCount)} adet)`}
            </p>
          </div>

          <div className="flex flex-1 flex-col bg-surface p-5 sm:p-6">
            <div className="tnum grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-b border-line pb-2 text-[0.74rem] font-semibold tracking-wide text-ink-3 uppercase">
              <span>Kalem</span>
              <span className="text-right">Adet</span>
              <span className="min-w-[5.5rem] text-right">Tutar</span>
            </div>
            <ul className="tnum flex flex-col text-[0.94rem]">
              <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 border-b border-dashed border-line py-2.5">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <Wheat size={15} className="shrink-0 text-amber" /> Ekmek parası
                </span>
                <span className="text-right text-ink-3">—</span>
                <span className="min-w-[5.5rem] text-right font-semibold">{money(breadValue)}</span>
              </li>
              {lines.map((l) => (
                <li key={l.name} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 border-b border-dashed border-line py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{l.name}</span>
                    <span className="text-[0.76rem] text-ink-3">{l.prices}</span>
                  </span>
                  <span className="text-right text-ink-2">{qty(l.qty)}</span>
                  <span className="min-w-[5.5rem] text-right font-semibold">{money(l.amount)}</span>
                </li>
              ))}
            </ul>
            {sales.length === 0 && <p className="py-4 text-center text-[0.85rem] text-ink-3">Ek ürün satışı eklenince burada listelenir.</p>}

            <div className="mt-auto pt-5">
              {sales.length > 0 && (
                <div className="tnum flex justify-between gap-3 py-1 text-[0.88rem] text-ink-2">
                  <span>Ek ürünler</span>
                  <span className="font-semibold">{money(itemsTotal)}</span>
                </div>
              )}
              <div className="tnum flex items-baseline justify-between gap-3 border-t-2 border-ink/80 pt-3">
                <span className="font-display text-[1.05rem] font-semibold">Toplam</span>
                <span className="font-display text-[1.6rem] font-semibold text-brand-deep dark:text-brand">{money(total)}</span>
              </div>
              <Button onClick={exportReport} disabled={exporting} className="mt-4 w-full">
                <FileSpreadsheet size={17} className="text-brand-deep dark:text-brand" /> {exporting ? "Hazırlanıyor…" : "Gün sonu çıktısı (A4)"}
              </Button>
            </div>
          </div>
        </section>

        {/* Ekmek parası */}
        <Tile i={1} className="lg:col-span-7">
          <TileTitle icon={<IconChip icon={Wheat} tone="amber" size="sm" />}>Tezgahtan gelen ekmek parası</TileTitle>
          <span className="relative block">
            <input
              value={breadText}
              readOnly={locked}
              inputMode="decimal"
              placeholder="0"
              autoComplete="off"
              aria-label="Tezgahtan gelen ekmek parası"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setBreadText(e.target.value.replace(/[^\d.,]/g, ""))}
              onBlur={commitBread}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={cx(inputClass, "min-h-16 pl-12 text-right font-display text-[1.9rem] font-semibold", locked && "bg-transparent shadow-none")}
            />
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[1.1rem] font-semibold text-ink-3">₺</span>
          </span>
          <p className="mt-2 text-[0.8rem] text-ink-3">Ekmek çeşidi fark etmez; gün içinde tezgahtan gelen toplam ekmek parası.</p>
        </Tile>

        {/* Ek ürünler */}
        <Tile i={2} className="lg:col-span-7">
          <TileTitle
            icon={<IconChip icon={ShoppingBasket} tone="sky" size="sm" />}
            aside={itemsTotal > 0 ? <span className="tnum text-[0.9rem] font-semibold">{money(itemsTotal)}</span> : undefined}
          >
            Ek ürün satışları
          </TileTitle>
          {sales.length === 0 ? (
            <p className="rounded-xl bg-bg-deep/60 px-3.5 py-3 text-[0.88rem] text-ink-2">Bugün ek ürün satılmadı.</p>
          ) : (
            <ul className="scroll-soft flex flex-col gap-2 lg:max-h-[26rem] lg:overflow-y-auto lg:pr-1">
              {sales.map((s) => (
                <SaleRow key={s.id} sale={s} locked={locked} />
              ))}
            </ul>
          )}
          {!locked && <AddSale day={day} picks={picks} />}
        </Tile>
      </div>
    </div>
  );
}

function SaleRow({ sale, locked }: { sale: CounterSale; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <li className={cx("flex items-center gap-3 rounded-xl bg-bg-deep/60 px-3.5 py-2.5", pending && "opacity-50")}>
      <span className="tnum grid min-w-9 place-items-center rounded-lg bg-surface px-1.5 py-1 text-[0.9rem] font-bold ring-1 ring-edge">
        {qty(sale.qty)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{sale.name}</span>
        <span className="tnum text-[0.78rem] text-ink-3">tanesi {money(sale.unit_price)}</span>
      </span>
      <span className="tnum font-semibold">{money(sale.amount)}</span>
      {!locked && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteCounterSale(sale.id);
              if (res.ok) toast(`${sale.name} silindi.`);
              else toast(res.error, "error");
            })
          }
          className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-debt-soft hover:text-debt"
          aria-label={`${sale.name} satırını sil`}
        >
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}

function AddSale({ day, picks }: { day: string; picks: Pick[] }) {
  const [name, setName] = useState("");
  const [count, setCount] = useState(1);
  const [price, setPrice] = useState("");
  const [pending, start] = useTransition();
  const priceValue = parseAmount(price);

  function choose(p: Pick) {
    setName(p.name);
    if (p.price != null) setPrice(toText(p.price));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast("Ürün adını yazın.", "error");
    if (priceValue == null) return toast("Fiyatı yazın.", "error");
    start(async () => {
      const res = await addCounterSale({ date: day, name, qty: count, unitPrice: priceValue });
      if (res.ok) {
        toast(`${count} × ${name.trim()} eklendi.`);
        setName("");
        setCount(1);
        setPrice("");
      } else toast(res.error, "error");
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-edge-strong p-3 sm:p-4">
      {picks.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hızlı seçim">
          {picks.map((p) => (
            <button
              key={p.name}
              type="button"
              aria-pressed={name === p.name}
              onClick={() => choose(p)}
              className={cx(
                "rounded-full px-3 py-1.5 text-[0.82rem] font-semibold transition-all duration-200",
                name === p.name ? "brand-fill" : "bg-bg-deep text-ink-2 hover:text-ink",
              )}
            >
              {p.name}
              {p.price != null && <span className="ml-1 opacity-70">{money(p.price)}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_8.5rem]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Ürün (ör. Zeytinyağı lüks)"
          aria-label="Ürün adı"
          className={cx(inputClass, "col-span-2 sm:col-span-1")}
        />
        <div className="neu-inset flex items-center justify-between rounded-control p-1">
          <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-surface" aria-label="Azalt">
            <Minus size={17} />
          </button>
          <span className="tnum min-w-8 text-center text-[1.05rem] font-bold" aria-live="polite">
            {count}
          </span>
          <button type="button" onClick={() => setCount((c) => Math.min(999, c + 1))} className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-surface" aria-label="Arttır">
            <Plus size={17} />
          </button>
        </div>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))}
          inputMode="decimal"
          placeholder="Tanesi ₺"
          aria-label="Birim fiyat"
          className={cx(inputClass, "text-right font-semibold")}
        />
      </div>
      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        <Plus size={18} />
        {pending ? "Ekleniyor…" : priceValue != null && name.trim() ? `Ekle · ${money(count * priceValue)}` : "Ekle"}
      </Button>
    </form>
  );
}
