"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { Field, buttonClass, cx, inputClass } from "@/components/ui";
import { createCustomer, updateCustomer } from "@/lib/actions";

export type CustomerFormValues = {
  id?: number;
  name: string;
  type: number;
  address: string | null;
  note: string | null;
};

/** Yeni müşteri (fiyatla birlikte) ya da mevcut kart düzenleme. */
export function CustomerForm({
  initial,
  onDone,
}: {
  initial?: CustomerFormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState(initial?.type ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = Boolean(initial?.id);

  function submit(formData: FormData) {
    formData.set("type", String(type));
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
        <Field label="Ekmek fiyatı (₺)" hint="Fiyatı daha sonra müşteri kartından değiştirebilirsiniz; eski satışlar eski fiyatta kalır.">
          <input name="price" required inputMode="decimal" placeholder="Örn. 40" autoComplete="off" className={inputClass} />
        </Field>
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
