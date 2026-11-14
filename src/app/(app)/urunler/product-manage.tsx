"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { Button, Field, buttonClass, cx, inputClass } from "@/components/ui";
import { createCategory, createProduct, deleteCategory, setProductActive, updateCategory, updateProduct } from "@/lib/actions";
import { parseAmount } from "@/lib/format";
import type { Category } from "./products-table";

type Product = {
  id: number;
  name: string;
  unit: string;
  suggested_price: number | null;
  is_active: boolean;
  category_id: number;
};

export function NewProductButton({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Plus size={19} /> Yeni ürün
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Yeni ürün">
        <ProductForm categories={categories} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

export function ProductMenu({ product, categories, compact }: { product: Product; categories: Category[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          "grid place-items-center rounded-xl text-ink-3 transition-colors hover:bg-brand-soft hover:text-brand-deep dark:hover:text-brand",
          compact ? "size-10" : "size-11",
        )}
        aria-label={`${product.name} düzenle`}
        title="Düzenle"
      >
        <Pencil size={16} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={product.name}>
        <ProductForm product={product} categories={categories} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function ProductForm({ product, categories, onDone }: { product?: Product; categories: Category[]; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(product?.category_id ?? categories[0]?.id ?? null);
  const [pending, start] = useTransition();
  const selected = categories.find((c) => c.id === categoryId);

  function submit(formData: FormData) {
    if (categoryId == null) return setError("Bir tür seçin.");
    const raw = String(formData.get("suggested_price") ?? "").trim();
    const input = {
      name: String(formData.get("name") ?? ""),
      unit: String(formData.get("unit") ?? "adet"),
      suggested_price: raw === "" ? null : parseAmount(raw),
      category_id: categoryId,
    };
    start(async () => {
      const res = product ? await updateProduct(product.id, input) : await createProduct(input);
      if (!res.ok) return setError(res.error);
      setError(null);
      toast(product ? "Ürün kaydedildi." : "Ürün eklendi.");
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
        <input name="name" required maxLength={60} defaultValue={product?.name} placeholder="Örn. Zeytinyağı lüks" autoComplete="off" className={inputClass} />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[0.85rem] font-semibold text-ink-2">Tür</legend>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
              className={cx(
                "min-h-10 rounded-full px-4 text-[0.88rem] font-semibold transition-all duration-200",
                categoryId === c.id ? "brand-fill" : "bg-bg-deep text-ink-2 hover:text-ink",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
        <span className="text-[0.78rem] text-ink-3">
          {selected?.is_bread
            ? "Ekmek türü: tezgahta ek ürün olarak listelenmez (tezgahta ekmek tek tutar girilir)."
            : "Tezgahta ek ürün olarak da satılabilir."}
        </span>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Birim" hint="adet, lt, kg, paket…">
          <input name="unit" required maxLength={12} defaultValue={product?.unit ?? "adet"} autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Öneri fiyat (₺)" hint="İsteğe bağlı">
          <input
            name="suggested_price"
            inputMode="decimal"
            defaultValue={product?.suggested_price != null ? String(product.suggested_price).replace(".", ",") : ""}
            placeholder="Örn. 1500"
            autoComplete="off"
            className={inputClass}
          />
        </Field>
      </div>
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

/** Tür yönetimi: ekle, adını/ekmek türü işaretini değiştir, boş türü sil. */
export function CategoriesButton({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Tags size={18} /> Türler
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ürün türleri">
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
          <NewCategory />
        </div>
      </Sheet>
    </>
  );
}

function BreadToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 text-left text-[0.84rem] font-semibold text-ink-2"
    >
      <span className={cx("grid size-6 shrink-0 place-items-center rounded-lg", value ? "brand-fill" : "neu-inset")}>
        {value && <Check size={14} strokeWidth={3} />}
      </span>
      Ekmek türü <span className="font-normal text-ink-3">(tezgahta ek ürün olarak çıkmaz)</span>
    </button>
  );
}

function CategoryRow({ category: c }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [bread, setBread] = useState(c.is_bread);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateCategory(c.id, { name, is_bread: bread });
      if (res.ok) {
        toast("Tür kaydedildi.");
        setEditing(false);
      } else toast(res.error, "error");
    });
  }

  function remove() {
    if (!window.confirm(`"${c.name}" türü silinsin mi?`)) return;
    start(async () => {
      const res = await deleteCategory(c.id);
      if (res.ok) toast("Tür silindi.");
      else toast(res.error, "error");
    });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-3 rounded-2xl bg-bg-deep/60 p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Tür adı" className={inputClass} />
        <BreadToggle value={bread} onChange={setBread} />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={() => setEditing(false)} disabled={pending}>
            <X size={16} /> Vazgeç
          </Button>
          <Button type="button" variant="primary" onClick={save} disabled={pending}>
            <Check size={16} /> Kaydet
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className={cx("flex min-h-14 items-center gap-3 rounded-2xl bg-bg-deep/60 px-3.5 py-2", pending && "opacity-50")}>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{c.name}</span>
        <span className="text-[0.76rem] text-ink-3">
          {c.count} ürün{c.is_bread ? " · ekmek türü" : ""}
        </span>
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="grid size-10 place-items-center rounded-xl text-ink-3 hover:bg-brand-soft hover:text-brand-deep"
        aria-label={`${c.name} düzenle`}
      >
        <Pencil size={16} />
      </button>
      {c.count === 0 && (
        <button
          type="button"
          onClick={remove}
          className="grid size-10 place-items-center rounded-xl text-ink-3 hover:bg-debt-soft hover:text-debt"
          aria-label={`${c.name} sil`}
        >
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}

function NewCategory() {
  const [name, setName] = useState("");
  const [bread, setBread] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createCategory({ name, is_bread: bread });
      if (res.ok) {
        toast("Tür eklendi.");
        setName("");
        setBread(false);
      } else toast(res.error, "error");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-dashed border-edge-strong p-3.5">
      <p className="text-[0.85rem] font-semibold text-ink-2">Yeni tür</p>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Örn. Yufka" aria-label="Yeni tür adı" className={inputClass} />
      <BreadToggle value={bread} onChange={setBread} />
      <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
        <Plus size={18} /> {pending ? "Ekleniyor…" : "Türü ekle"}
      </Button>
    </form>
  );
}
