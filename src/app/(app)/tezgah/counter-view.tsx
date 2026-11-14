"use client";

import { useState, useTransition } from "react";
import { Check, FileSpreadsheet, Lock, Minus, Plus, ShoppingBasket, Store, Trash2, Wheat } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { Combobox } from "@/components/combobox";
import { toast } from "@/components/toast";
import { Button, IconChip, Tile, TileTitle, cx, inputClass } from "@/components/ui";
import { addCounterSale, deleteCounterSale, saveCounterBread, setCounterSaleQty } from "@/lib/actions";
import { money, parseAmount, qty } from "@/lib/format";
import { downloadCounterReport } from "./counter-export";

export type CounterSale = { id: number; name: string; qty: number; unit_price: number; amount: number };
type Pick = { name: string; price: number | null };

const toText = (v: number | null) => (v == null || v === 0 ? "" : Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));

/**
 * Tezgah: solda giriş (ekmek parası + ek ürün ekle), sağda fiş.
 * Ek ürünler yalnızca fişte listelenir; adet orada − / + ile değişir. Aynı ürün tek satırdır.
 */
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

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-12">
        {/* Sol: giriş */}
        <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-7">
          <Tile i={1}>
            <TileTitle
              icon={<IconChip icon={Wheat} tone="amber" size="sm" />}
              aside={
                <span className="flex h-6 items-center gap-1 text-[0.8rem] font-semibold text-ink-3">
                  {state === "saving" && "Kaydediliyor…"}
                  {state === "saved" && (
                    <span className="flex items-center gap-1 text-brand-deep dark:text-brand">
                      <Check size={14} /> Kaydedildi
                    </span>
                  )}
                </span>
              }
            >
              Tezgahtan gelen ekmek parası
            </TileTitle>
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
                className={cx(inputClass, "min-h-14 pl-12 text-right font-display text-[1.7rem] font-semibold", locked && "bg-transparent shadow-none")}
              />
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[1.1rem] font-semibold text-ink-3">₺</span>
            </span>
            <p className="mt-2 text-[0.8rem] text-ink-3">Ekmek çeşidi fark etmez; gün içinde tezgahtan gelen toplam.</p>
          </Tile>

          <Tile i={2}>
            <TileTitle icon={<IconChip icon={ShoppingBasket} tone="sky" size="sm" />}>Ek ürün ekle</TileTitle>
            {locked ? (
              <p className="rounded-xl bg-bg-deep/60 px-3.5 py-3 text-[0.88rem] text-ink-2">Bu gün kilitli.</p>
            ) : (
              <AddSale day={day} picks={picks} />
            )}
          </Tile>
        </div>

        {/* Sağ: fiş (tek liste) */}
        <section className="animate-rise order-first flex flex-col overflow-hidden rounded-tile shadow-[0_24px_48px_-24px_rgba(8,60,32,0.45)] lg:sticky lg:top-6 lg:order-none lg:col-span-5">
          <div className="brand-fill relative overflow-hidden px-5 py-5 sm:px-6">
            <div className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-white/[0.07]" aria-hidden />
            <h2 className="relative flex items-center gap-2 font-display text-[1.05rem] font-semibold">
              <Store size={18} /> Tezgah toplamı
            </h2>
            <p className="relative mt-3 font-display tnum text-[2.5rem] leading-none font-semibold tracking-[-0.03em] sm:text-[2.9rem]">
              <AnimatedNumber value={total} />
            </p>
            <p className="relative mt-1.5 text-[0.84rem] text-white/80">
              {sales.length === 0 ? "Yalnızca ekmek" : `Ekmek + ${sales.length} kalem ek ürün (${qty(itemCount)} adet)`}
            </p>
          </div>

          <div className="flex flex-col bg-surface px-5 pt-4 pb-5 sm:px-6">
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_2rem] items-center gap-x-2 border-b border-line pb-2 text-[0.72rem] font-semibold tracking-wide text-ink-3 uppercase">
              <span>Kalem</span>
              <span className="text-center">Adet</span>
              <span className="text-right">Tutar</span>
              <span />
            </div>
            <div className="tnum grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_2rem] items-center gap-x-2 border-b border-dashed border-line py-2.5 text-[0.94rem]">
              <span className="font-semibold">Ekmek parası</span>
              <span className="text-center text-ink-3">—</span>
              <span className="text-right font-semibold">{money(breadValue)}</span>
              <span />
            </div>
            {sales.length === 0 ? (
              <p className="py-5 text-center text-[0.85rem] text-ink-3">Ek ürün eklenince burada listelenir.</p>
            ) : (
              <ul className="scroll-soft max-h-[19rem] overflow-y-auto">
                {sales.map((s) => (
                  <ReceiptRow key={s.id} sale={s} locked={locked} />
                ))}
              </ul>
            )}

            <div className="mt-3 border-t-2 border-ink/80 pt-3">
              {sales.length > 0 && (
                <div className="tnum flex justify-between gap-3 pb-1 text-[0.86rem] text-ink-2">
                  <span>Ekmek {money(breadValue)} + ek ürünler {money(itemsTotal)}</span>
                </div>
              )}
              <div className="tnum flex items-baseline justify-between gap-3">
                <span className="font-display text-[1.05rem] font-semibold">Toplam</span>
                <span className="font-display text-[1.55rem] font-semibold text-brand-deep dark:text-brand">{money(total)}</span>
              </div>
              <Button onClick={exportReport} disabled={exporting} className="mt-4 w-full">
                <FileSpreadsheet size={17} className="text-brand-deep dark:text-brand" /> {exporting ? "Hazırlanıyor…" : "Gün sonu çıktısı (A4)"}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Fiş satırı: adet − / + ile değişir, 0 olunca ya da çöp ile silinir. */
function ReceiptRow({ sale, locked }: { sale: CounterSale; locked: boolean }) {
  const [pending, start] = useTransition();

  function setQty(n: number) {
    start(async () => {
      const res = n <= 0 ? await deleteCounterSale(sale.id) : await setCounterSaleQty(sale.id, n);
      if (!res.ok) toast(res.error, "error");
      else if (n <= 0) toast(`${sale.name} silindi.`);
    });
  }

  return (
    <li
      className={cx(
        "tnum grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_2rem] items-center gap-x-2 border-b border-dashed border-line py-2 text-[0.94rem] last:border-b-0",
        pending && "opacity-50",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{sale.name}</span>
        <span className="text-[0.74rem] text-ink-3">tanesi {money(sale.unit_price)}</span>
      </span>
      {locked ? (
        <span className="text-center">{qty(sale.qty)}</span>
      ) : (
        <span className="flex items-center justify-between rounded-lg bg-bg-deep/70 p-0.5">
          <button type="button" disabled={pending} onClick={() => setQty(sale.qty - 1)} className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface" aria-label={`${sale.name} azalt`}>
            <Minus size={14} />
          </button>
          <span className="min-w-6 text-center font-bold">{qty(sale.qty)}</span>
          <button type="button" disabled={pending} onClick={() => setQty(sale.qty + 1)} className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface" aria-label={`${sale.name} arttır`}>
            <Plus size={14} />
          </button>
        </span>
      )}
      <span className="text-right font-semibold">{money(sale.amount)}</span>
      {locked ? (
        <span />
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setQty(0)}
          className="grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-debt-soft hover:text-debt"
          aria-label={`${sale.name} sil`}
        >
          <Trash2 size={15} />
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
  const quick = picks.slice(0, 4);

  function choose(p: Pick) {
    setName(p.name);
    if (p.price != null) setPrice(toText(p.price));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast("Ürün seçin ya da adını yazın.", "error");
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
    <form onSubmit={submit} className="flex flex-col gap-3">
      {quick.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Son satılanlar">
          <span className="mr-1 text-[0.76rem] font-semibold text-ink-3">Son satılanlar</span>
          {quick.map((p) => (
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
        <Combobox
          value={name}
          onChange={setName}
          options={picks.map((p) => ({ key: p.name, label: p.name, hint: p.price != null ? money(p.price) : undefined }))}
          onPick={(o) => choose(picks.find((p) => p.name === o.key)!)}
          placeholder={picks.length > 4 ? `Ürün ara (${picks.length} ürün)` : "Ürün ara ya da yaz"}
          ariaLabel="Ürün"
          free
          className="col-span-2 sm:col-span-1"
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
