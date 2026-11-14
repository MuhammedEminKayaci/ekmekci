"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { Check } from "lucide-react";
import { Field, buttonClass, cx, inputClass } from "@/components/ui";
import { parseAmount } from "@/lib/format";
import { createCustomer, updateCustomer } from "@/lib/actions";

export type CustomerFormValues = {
  id?: number;
  name: string;
  type: number;
  address: string | null;
  note: string | null;
};

/** Yeni müşteri (fiyatla birlikte) ya da mevcut kart düzenleme. */
export type CatalogProduct = { id: number; name: string; unit: string; suggested_price: number | null };

export function CustomerForm({
  initial,
  catalog = [],
  onDone,
}: {
  initial?: CustomerFormValues;
  catalog?: CatalogProduct[];
  onDone?: () => void;
}) {
  // Yeni müşteride: hangi ürünleri alıyor ve her birinin fiyatı. İlk ürün (Ekmek) hazır seçili.
  const [picked, setPicked] = useState<Record<number, string>>(() =>
    catalog.length ? { [catalog[0].id]: catalog[0].suggested_price ? String(catalog[0].suggested_price).replace(".", ",") : "" } : {},
  );
  const router = useRouter();
  const [type, setType] = useState(initial?.type ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = Boolean(initial?.id);

  function submit(formData: FormData) {
    formData.set("type", String(type));
    if (!editing) {
      formData.set(
        "products",
        JSON.stringify(
          Object.entries(picked).map(([id, price]) => ({ product_id: Number(id), price: parseAmount(price) ?? 0 })),
        ),
      );
    }
    start(async () => {
      const res = editing ? await updateCustomer(initial!.id!, formData) : await createCustomer(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      toast(editing ? "Müşteri kartı kaydedildi." : "Müşteri oluşturuldu.");
      onDone?.();
      if (!editing && typeof res.data === "number") router.push(`/musteriler/${res.data}`);
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[0.8rem] font-semibold text-ink-2">Müşteri türü</legend>
        <div className="neu-inset grid grid-cols-2 rounded-full p-1.5">
          {[
            { v: 1, label: "Şahıs" },
            { v: 2, label: "Kurumsal" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              aria-pressed={type === o.v}
              onClick={() => setType(o.v)}
              className={cx(
                "min-h-11 rounded-full text-[0.92rem] font-semibold transition-all duration-300",
                type === o.v ? "brand-fill" : "text-ink-2 hover:text-ink",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label={type === 2 ? "Firma adı" : "Ad soyad"}>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={initial?.name}
          autoComplete="off"
          placeholder={type === 2 ? "Örn. Yıldız Kafe" : "Örn. Ahmet Yılmaz"}
          className={inputClass}
        />
      </Field>

      {!editing && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[0.85rem] font-semibold text-ink-2">Aldığı ürünler ve fiyatları</legend>
          {catalog.length === 0 && <p className="text-[0.85rem] text-ink-3">Önce Ürünler sayfasından ürün ekleyin.</p>}
          {catalog.map((p) => {
            const on = p.id in picked;
            return (
              <div key={p.id} className={cx("flex items-center gap-3 rounded-2xl p-2 pl-3", on ? "bg-brand-soft ring-1 ring-brand/40" : "neu-sm")}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((prev) => {
                      const next = { ...prev };
                      if (on) delete next[p.id];
                      else next[p.id] = p.suggested_price ? String(p.suggested_price).replace(".", ",") : "";
                      return next;
                    })
                  }
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left font-semibold"
                >
                  <span className={cx("grid size-6 shrink-0 place-items-center rounded-full", on ? "brand-fill" : "neu-inset")}>
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
                {on && (
                  <input
                    value={picked[p.id]}
                    onChange={(e) => setPicked((prev) => ({ ...prev, [p.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                    inputMode="decimal"
                    placeholder="Fiyat ₺"
                    aria-label={`${p.name} fiyatı`}
                    required
                    className={cx(inputClass, "max-w-32 text-right font-semibold")}
                  />
                )}
              </div>
            );
          })}
          <span className="text-[0.8rem] text-ink-3">Fiyatlar bu müşteriye özeldir; sonradan müşteri kartından değiştirilebilir.</span>
        </fieldset>
      )}

      <Field label="Adres (isteğe bağlı)">
        <textarea
          name="address"
          rows={2}
          maxLength={500}
          defaultValue={initial?.address ?? ""}
          className={cx(inputClass, "resize-none py-2.5")}
        />
      </Field>

      <Field label="Not (isteğe bağlı)">
        <textarea
          name="note"
          rows={2}
          maxLength={1000}
          defaultValue={initial?.note ?? ""}
          className={cx(inputClass, "resize-none py-2.5")}
        />
      </Field>

      {error && (
        <p role="alert" className="rounded-control bg-debt-soft px-3.5 py-2.5 text-[0.88rem] font-medium text-debt">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className={buttonClass("primary", "mt-1 min-h-14 w-full text-[1rem]")}>
        {pending ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Müşteriyi oluştur"}
      </button>
    </form>
  );
}
