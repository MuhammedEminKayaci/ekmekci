"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { Button, Field, buttonClass, inputClass } from "@/components/ui";
import { createProduct, setProductActive, updateProduct } from "@/lib/actions";
import { parseAmount } from "@/lib/format";

type Product = { id: number; name: string; unit: string; suggested_price: number | null; is_active: boolean };

export function NewProductButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Plus size={19} /> Yeni ürün
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Yeni ürün">
        <ProductForm onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

export function ProductMenu({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.85rem] font-semibold text-brand-deep hover:bg-brand-soft dark:text-brand"
      >
        <Pencil size={14} /> Düzenle
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={product.name}>
        <ProductForm product={product} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    const raw = String(formData.get("suggested_price") ?? "").trim();
    const input = {
      name: String(formData.get("name") ?? ""),
      unit: String(formData.get("unit") ?? "adet"),
      suggested_price: raw === "" ? null : parseAmount(raw),
    };
    start(async () => {
      const res = product ? await updateProduct(product.id, input) : await createProduct(input);
      if (!res.ok) return setError(res.error);
      setError(null);
      toast(product ? "Ürün kaydedildi." : "Ürün eklendi. Müşteri kartından müşterilere ekleyebilirsiniz.");
      onDone();
    });
  }

  function toggle() {
    if (!product) return;
    start(async () => {
      const res = await setProductActive(product.id, !product.is_active);
      if (!res.ok) return setError(res.error);
      toast(product.is_active ? "Ürün pasife alındı; yeni günlere eklenmez." : "Ürün tekrar aktif.");
      onDone();
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <Field label="Ürün adı">
        <input name="name" required maxLength={60} defaultValue={product?.name} placeholder="Örn. Simit" autoComplete="off" className={inputClass} />
      </Field>
      <Field label="Birim" hint="Adet, paket, kg…">
        <input name="unit" required maxLength={12} defaultValue={product?.unit ?? "adet"} autoComplete="off" className={inputClass} />
      </Field>
      <Field label="Öneri fiyat (₺, isteğe bağlı)" hint="Müşteriye eklerken hazır gelir; her müşteriye ayrı fiyat yazılabilir.">
        <input
          name="suggested_price"
          inputMode="decimal"
          defaultValue={product?.suggested_price != null ? String(product.suggested_price).replace(".", ",") : ""}
          placeholder="Örn. 12,50"
          autoComplete="off"
          className={inputClass}
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-control bg-debt-soft px-3.5 py-2.5 text-[0.88rem] font-medium text-debt">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "min-h-14 w-full text-[1rem]")}>
        {pending ? "Kaydediliyor…" : product ? "Kaydet" : "Ürünü ekle"}
      </button>
      {product && (
        <Button type="button" onClick={toggle} disabled={pending}>
          {product.is_active ? "Pasife al" : "Tekrar aktifleştir"}
        </Button>
      )}
    </form>
  );
}
