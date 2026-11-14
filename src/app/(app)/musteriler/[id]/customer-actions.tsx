"use client";

import { useState, useTransition } from "react";
import { Pencil, Power, X } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { Button, Field, buttonClass, cx, inputClass } from "@/components/ui";
import { removeCustomerProduct, setCustomerActive, setCustomerPrice } from "@/lib/actions";
import { CustomerForm, type CustomerFormValues } from "../customer-form";

export function CustomerActions({ customer }: { customer: CustomerFormValues & { is_active: boolean } }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggleActive() {
    start(async () => {
      const res = await setCustomerActive(customer.id!, !customer.is_active);
      setError(res.ok ? null : res.error);
      if (res.ok) toast(customer.is_active ? "Müşteri pasife alındı." : "Müşteri tekrar aktif.");
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex gap-2.5">
        <Button onClick={toggleActive} disabled={pending} className="flex-1 sm:flex-none">
          <Power size={16} />
          {customer.is_active ? "Pasife al" : "Aktifleştir"}
        </Button>
        <Button variant="primary" onClick={() => setEditing(true)} className="flex-1 sm:flex-none">
          <Pencil size={16} /> Kartı düzenle
        </Button>
      </div>
      {error && <p className="text-[0.85rem] font-medium text-debt">{error}</p>}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Müşteri kartı">
        <CustomerForm initial={customer} onDone={() => setEditing(false)} />
      </Sheet>
    </div>
  );
}

export type OwnedProduct = { product_id: number; name: string; unit: string; price: number | null; since: string | null };

type Addable = { id: number; name: string; suggested_price: number | null };

/** Bir ürünün fiyatını değiştir ya da müşteriye yeni ürün ekle (ilk fiyatla). */
export function PriceAction({
  customerId,
  today,
  owned,
  addable,
}: {
  customerId: number;
  today: string;
  owned: OwnedProduct[];
  addable: Addable[];
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<number | null>(owned[0]?.product_id ?? addable[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isNew = productId != null && !owned.some((o) => o.product_id === productId);
  const suggested = addable.find((a) => a.id === productId)?.suggested_price;

  function submit(formData: FormData) {
    if (productId == null) return;
    formData.set("product_id", String(productId));
    start(async () => {
      const res = await setCustomerPrice(customerId, formData);
      if (res.ok) {
        setError(null);
        setOpen(false);
        toast(isNew ? "Ürün müşteriye eklendi." : "Yeni fiyat kaydedildi.");
      } else setError(res.error);
    });
  }

  const chip = (id: number, label: string, fresh: boolean) => (
    <button
      key={id}
      type="button"
      aria-pressed={productId === id}
      onClick={() => setProductId(id)}
      className={cx(
        "min-h-10 rounded-full px-3.5 text-[0.88rem] font-semibold transition-all duration-200",
        productId === id ? "brand-fill" : "bg-bg-deep text-ink-2 hover:text-ink",
      )}
    >
      {fresh ? `+ ${label}` : label}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-2.5 py-1.5 text-[0.85rem] font-semibold text-brand-deep hover:bg-brand-soft dark:text-brand"
      >
        Fiyat / ürün
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={isNew ? "Ürün ekle" : "Fiyatı değiştir"}>
        <form action={submit} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[0.85rem] font-semibold text-ink-2">Ürün</legend>
            <div className="flex flex-wrap gap-2">
              {owned.map((o) => chip(o.product_id, o.name, false))}
              {addable.map((a) => chip(a.id, a.name, true))}
            </div>
            {addable.length > 0 && <span className="text-[0.78rem] text-ink-3">“+” ile başlayanlar bu müşteriye yeni eklenir.</span>}
          </fieldset>
          <Field label={isNew ? "Bu müşteriye fiyatı (₺)" : "Yeni fiyat (₺)"}>
            <input
              key={productId ?? 0}
              name="price"
              required
              inputMode="decimal"
              autoComplete="off"
              defaultValue={isNew && suggested ? String(suggested).replace(".", ",") : ""}
              placeholder="Örn. 42,50"
              className={inputClass}
            />
          </Field>
          <Field
            label="Geçerli olacağı tarih"
            hint="Bu tarihten önceki satışlar eski fiyatta kalır. Geçmiş haftalar seçilemez."
          >
            <input name="valid_from" type="date" required defaultValue={today} className={inputClass} />
          </Field>
          {error && (
            <p role="alert" className="rounded-control bg-debt-soft px-3.5 py-2.5 text-[0.88rem] font-medium text-debt">
              {error}
            </p>
          )}
          <button type="submit" disabled={pending || productId == null} className={buttonClass("primary", "min-h-14 w-full text-[1rem]")}>
            {pending ? "Kaydediliyor…" : isNew ? "Ürünü ekle" : "Fiyatı kaydet"}
          </button>
        </form>
      </Sheet>
    </>
  );
}

/** Ürünü müşteriden kaldırır (geçmiş satışlar durur; yeni günlere eklenmez). */
export function RemoveProduct({ customerId, productId, name }: { customerId: number; productId: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`${name} bu müşteriden kaldırılsın mı? Geçmiş satışlar silinmez.`)) return;
        start(async () => {
          const res = await removeCustomerProduct(customerId, productId);
          if (res.ok) toast(`${name} kaldırıldı.`);
          else toast(res.error, "error");
        });
      }}
      className="grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-debt-soft hover:text-debt"
      aria-label={`${name} ürününü kaldır`}
    >
      <X size={15} />
    </button>
  );
}
