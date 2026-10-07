"use client";

import { useState, useTransition } from "react";
import { Pencil, Power } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { Button, Field, buttonClass, inputClass } from "@/components/ui";
import { setCustomerActive, setCustomerPrice } from "@/lib/actions";
import { CustomerForm, type CustomerFormValues } from "../customer-form";

export function CustomerActions({ customer }: { customer: CustomerFormValues & { is_active: boolean } }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggleActive() {
    start(async () => {
      const res = await setCustomerActive(customer.id!, !customer.is_active);
      setError(res.ok ? null : res.error);
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

export function PriceAction({ customerId, today }: { customerId: number; today: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    start(async () => {
      const res = await setCustomerPrice(customerId, formData);
      if (res.ok) {
        setError(null);
        setOpen(false);
      } else setError(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[0.85rem] font-semibold text-ink-2 hover:text-ink">
        Değiştir
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Fiyatı değiştir">
        <form action={submit} className="flex flex-col gap-4">
          <Field label="Yeni fiyat (₺)">
            <input name="price" required inputMode="decimal" autoComplete="off" className={inputClass} />
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
          <button type="submit" disabled={pending} className={buttonClass("primary", "w-full")}>
            {pending ? "Kaydediliyor…" : "Fiyatı kaydet"}
          </button>
        </form>
      </Sheet>
    </>
  );
}
