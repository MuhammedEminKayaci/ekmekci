"use server";

// Bütün işlemler kullanıcının oturumuyla çalışır; asıl yetki kontrolü veri tabanındaki
// satır kurallarıdır (RLS). Buradaki kontroller girdiyi temizler ve anlaşılır hata verir.
// Server Action'lar dışarıdan doğrudan çağrılabildiği için TypeScript tiplerine güvenilmez:
// her parametre çalışma anında doğrulanır.

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addDays, isISODate, parseAmount } from "@/lib/format";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

type PgError = { code?: string; message: string; details?: string | null };

const BAD_INPUT = { ok: false, error: "Geçersiz istek." } as const;
const NO_PERMISSION = { ok: false, error: "Bu işlem için yetkiniz yok." } as const;
const MAX_MONEY = 9_999_999;

function friendly(err: PgError): string {
  if (err.code === "23505" && err.message.includes("customers_name_unique")) {
    return "Bu isimde bir müşteri zaten var.";
  }
  if (err.code === "23505" && err.message.includes("drivers_name_unique")) {
    return "Bu isimde bir dağıtıcı zaten var.";
  }
  if (err.code === "23505" && err.message.includes("products_name_unique")) {
    return "Bu isimde bir ürün zaten var.";
  }
  if (err.code === "23505" && err.message.includes("product_categories_name_unique")) {
    return "Bu isimde bir tür zaten var.";
  }
  if (err.code === "23503" && err.message.includes("products_category_id_fkey")) {
    return "Bu türde ürünler var; önce ürünleri başka türe taşıyın.";
  }
  if (err.code === "23505" && err.message.includes("expense_categories_name_unique")) {
    return "Bu gider türü zaten var.";
  }
  if (err.code === "23505" && err.message.includes("order_lines_order_product")) {
    return "Bu ürün bu müşterinin satırında zaten var.";
  }
  if (err.code === "23505" && err.message.includes("orders_customer_day")) {
    return "Bu müşteri o gün bu dağıtıcının listesinde zaten var.";
  }
  if (err.code === "23514") return "Girilen değer izin verilen aralığın dışında.";
  if (err.code === "42501") return NO_PERMISSION.error;
  // Yalnızca kendi tetikleyicilerimizin Türkçe mesajları gösterilir.
  if (err.code === "P0001") return err.message;
  return "İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.";
}

// --- Girdi doğrulama ---------------------------------------------------------

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

function idList(v: unknown, max = 500): number[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  return v.every(isId) ? [...new Set(v as number[])] : null;
}

/** Sayı ya da sayı metni → 0..max aralığında, kuruşa yuvarlanmış tutar. */
function moneyValue(v: unknown, max = MAX_MONEY): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseAmount(v) : null;
  if (n == null || !Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}

function qtyValue(v: unknown): number | null {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null;
  return Math.trunc(n);
}

/** Metni kırpar; uzunluk sınırını aşarsa ya da metin değilse null. */
function text(v: unknown, max: number): string | null | undefined {
  if (v == null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s+/g, " ");
  if (s.length > max) return undefined;
  return s || null;
}

// --- Oturum ------------------------------------------------------------------
// Giriş tarayıcıdan doğrudan Supabase'e yapılır (src/app/giris/login-form.tsx):
// deneme sınırı her ziyaretçinin kendi adresine göre işler.

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/giris");
}

// --- Müşteriler --------------------------------------------------------------

function readCustomerForm(formData: FormData) {
  const name = text(formData.get("name"), 120);
  const type = Number(formData.get("type")) === 2 ? 2 : 1;
  const address = text(formData.get("address"), 500);
  const note = text(formData.get("note"), 1000);
  return { name, type, address, note };
}

/** Form alanı "products": [{"product_id": 1, "price": 45}] (JSON). */
function readProductPrices(raw: FormDataEntryValue | null): Array<{ product_id: number; price: number }> | null {
  if (typeof raw !== "string" || raw.length > 5000) return null;
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length > 50) return null;
  const out: Array<{ product_id: number; price: number }> = [];
  const seen = new Set<number>();
  for (const item of list) {
    if (typeof item !== "object" || item === null) return null;
    const { product_id, price } = item as { product_id: unknown; price: unknown };
    const value = moneyValue(price, 99_999);
    if (!isId(product_id) || value == null || value <= 0 || seen.has(product_id)) return null;
    seen.add(product_id);
    out.push({ product_id, price: value });
  }
  return out;
}

export async function createCustomer(formData: FormData): Promise<ActionResult<number>> {
  if (!(formData instanceof FormData)) return BAD_INPUT;
  const { name, type, address, note } = readCustomerForm(formData);
  if (!name) return { ok: false, error: "Müşteri adı gerekli (en çok 120 karakter)." };
  if (address === undefined || note === undefined) return { ok: false, error: "Adres ya da not çok uzun." };
  const buys = formData.get("buys_products") !== "0";
  const products = buys ? readProductPrices(formData.get("products")) : [];
  if (!products) return { ok: false, error: "Seçilen ürünlerin fiyatını girin." };
  if (buys && products.length === 0) return { ok: false, error: "En az bir ürün seçin ya da “Ürün alır” tikini kaldırın." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_customer", {
    p_type: type,
    p_name: name,
    p_products: products,
    p_address: address ?? undefined,
    p_note: note ?? undefined,
    p_buys_products: buys,
  });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true, data };
}

export async function updateCustomer(id: number, formData: FormData): Promise<ActionResult> {
  if (!isId(id) || !(formData instanceof FormData)) return BAD_INPUT;
  const { name, type, address, note } = readCustomerForm(formData);
  if (!name) return { ok: false, error: "Müşteri adı gerekli (en çok 120 karakter)." };
  if (address === undefined || note === undefined) return { ok: false, error: "Adres ya da not çok uzun." };

  const supabase = await createClient();
  const buysRaw = formData.get("buys_products");
  const patch = buysRaw === "0" || buysRaw === "1" ? { name, type, address, note, buys_products: buysRaw === "1" } : { name, type, address, note };
  const { data, error } = await supabase.from("customers").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

export async function setCustomerActive(id: number, active: boolean): Promise<ActionResult> {
  if (!isId(id) || typeof active !== "boolean") return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

/** Müşteriye ürün ekler ya da ürünün fiyatını değiştirir (form: product_id, price, valid_from). */
export async function setCustomerPrice(id: number, formData: FormData): Promise<ActionResult> {
  if (!isId(id) || !(formData instanceof FormData)) return BAD_INPUT;
  const productId = Number(formData.get("product_id"));
  if (!isId(productId)) return { ok: false, error: "Ürün seçin." };
  const price = moneyValue(formData.get("price"), 99_999);
  const validFrom = String(formData.get("valid_from") ?? "");
  if (price == null || price <= 0) return { ok: false, error: "Geçerli bir fiyat girin." };
  if (!isISODate(validFrom)) return { ok: false, error: "Geçerli bir başlangıç tarihi seçin." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_customer_price", {
    p_customer_id: id,
    p_product_id: productId,
    p_price: price,
    p_valid_from: validFrom,
  });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

/** Ürünü müşterinin listesinden çıkarır (geçmiş satışlar ve fiyat geçmişi korunur). */
export async function removeCustomerProduct(customerId: number, productId: number): Promise<ActionResult> {
  if (!isId(customerId) || !isId(productId)) return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_products")
    .update({ is_active: false })
    .eq("customer_id", customerId)
    .eq("product_id", productId)
    .select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

// --- Ürünler (yalnızca yönetici) ------------------------------------------------

export type ProductInput = { name: string; unit: string; suggested_price: number | null; category_id: number };

function readProduct(
  input: unknown,
): { name: string; unit: string; suggested_price: number | null; category_id: number } | null {
  if (typeof input !== "object" || input === null) return null;
  const { name, unit, suggested_price, category_id } = input as ProductInput;
  const n = text(name, 60);
  const u = text(unit, 12) ?? "adet";
  const price = suggested_price == null ? null : moneyValue(suggested_price, 99_999);
  if (!n || u === undefined || !isId(category_id) || (suggested_price != null && (price == null || price <= 0))) return null;
  return { name: n, unit: u, suggested_price: price, category_id };
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  const p = readProduct(input);
  if (!p) return { ok: false, error: "Ürün adı ve türü gerekli; birim ve öneri fiyatı geçerli olmalı." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("products")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("products").insert({ ...p, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

export async function updateProduct(id: number, input: ProductInput): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  const p = readProduct(input);
  if (!p) return { ok: false, error: "Ürün adı gerekli; birim ve öneri fiyatı geçerli olmalı." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update(p).eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

export async function setProductActive(id: number, active: boolean): Promise<ActionResult> {
  if (!isId(id) || typeof active !== "boolean") return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

// --- Ürün türleri (yalnızca yönetici) -------------------------------------------

export type CategoryInput = { name: string; is_bread: boolean; color: string };

const COLORS = new Set(["amber", "emerald", "sky", "violet", "rose", "orange", "teal", "indigo", "lime", "fuchsia"]);

function readCategory(input: unknown): CategoryInput | null {
  if (typeof input !== "object" || input === null) return null;
  const { name, is_bread, color } = input as CategoryInput;
  const n = text(name, 40);
  if (!n || typeof is_bread !== "boolean" || typeof color !== "string" || !COLORS.has(color)) return null;
  return { name: n, is_bread, color };
}

export async function createCategory(input: CategoryInput): Promise<ActionResult> {
  const c = readCategory(input);
  if (!c) return { ok: false, error: "Tür adını yazın." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("product_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("product_categories").insert({ ...c, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

export async function updateCategory(id: number, input: CategoryInput): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  const c = readCategory(input);
  if (!c) return { ok: false, error: "Tür adını yazın." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("product_categories").update(c).eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase.from("product_categories").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

// --- Siparişler --------------------------------------------------------------

type Db = Awaited<ReturnType<typeof createClient>>;

/** Dağıtıcı verilmezse işletme sahibinin ("Ben") kendi dağıtımı kullanılır. */
async function resolveDriver(supabase: Db, driverId?: number): Promise<number | null> {
  if (isId(driverId)) return driverId;
  const { data } = await supabase.from("drivers").select("id").eq("is_owner", true).maybeSingle();
  return data?.id ?? null;
}

export async function addCustomersToDay(
  date: string,
  customerIds: number[],
  driverId?: number,
): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  if (driverId != null && !isId(driverId)) return BAD_INPUT;
  const ids = idList(customerIds);
  if (!ids) return BAD_INPUT;
  if (ids.length === 0) return { ok: false, error: "En az bir müşteri seçin." };

  const supabase = await createClient();
  const driver = await resolveDriver(supabase, driverId);
  if (!driver) return { ok: false, error: "Dağıtıcı bulunamadı." };

  // Seçilen sırayla dağıtıcının gün listesinin sonuna eklenir; zaten listede olanlar yerinde kalır.
  const { data: last } = await supabase
    .from("orders")
    .select("sort_order")
    .eq("entry_date", date)
    .eq("driver_id", driver)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = last?.sort_order ?? 0;

  const { data: created, error } = await supabase
    .from("orders")
    .upsert(
      ids.map((customer_id, i) => ({ customer_id, entry_date: date, driver_id: driver, sort_order: base + i + 1 })),
      { onConflict: "customer_id,entry_date,driver_id", ignoreDuplicates: true },
    )
    .select("id, customer_id");
  if (error) return { ok: false, error: friendly(error) };

  // Yeni eklenen her müşteriye aldığı ürünlerin satırları hazır gelsin.
  if (created?.length) {
    const { data: cps } = await supabase
      .from("customer_products")
      .select("customer_id, product_id, products!inner(is_active)")
      .in("customer_id", created.map((o) => o.customer_id))
      .eq("is_active", true)
      .eq("products.is_active", true);
    const byCustomer = new Map(created.map((o) => [o.customer_id, o.id]));
    const lines = (cps ?? [])
      .filter((cp) => byCustomer.has(cp.customer_id))
      .map((cp) => ({ order_id: byCustomer.get(cp.customer_id)!, product_id: cp.product_id }));
    if (lines.length) {
      const { error: lineErr } = await supabase.from("order_lines").insert(lines);
      if (lineErr) return { ok: false, error: friendly(lineErr) };
    }
  }

  refresh();
  return { ok: true };
}

/** Günün listesini verilen sırayla kaydeder (ids[0] en üstte). */
export async function reorderDay(date: string, orderIds: number[]): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  const ids = idList(orderIds);
  if (!ids) return BAD_INPUT;
  if (ids.length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_day", { p_date: date, p_ids: ids });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

/** Dağıtıcının geçen haftanın aynı günündeki listesini (aynı sırayla) bu güne ekler. */
export async function copyDayFromLastWeek(date: string, driverId?: number): Promise<ActionResult<number>> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  if (driverId != null && !isId(driverId)) return BAD_INPUT;

  const supabase = await createClient();
  const driver = await resolveDriver(supabase, driverId);
  if (!driver) return { ok: false, error: "Dağıtıcı bulunamadı." };

  const { data: prev, error: readErr } = await supabase
    .from("orders")
    .select("customer_id, sort_order, customers!inner(is_active)")
    .eq("entry_date", addDays(date, -7))
    .eq("driver_id", driver)
    .eq("customers.is_active", true)
    .order("sort_order");
  if (readErr) return { ok: false, error: friendly(readErr) };
  if (!prev?.length) return { ok: false, error: "Geçen haftanın bu gününde bu dağıtıcının kaydı yok." };

  const res = await addCustomersToDay(
    date,
    prev.map((r) => r.customer_id),
    driver,
  );
  return res.ok ? { ok: true, data: prev.length } : res;
}

/** Siparişin güncel toplamları (satırlar ve tahsilat değiştikçe veri tabanı yeniden hesaplar). */
export type OrderTotals = {
  delivered_qty: number;
  returned_qty: number;
  net_amount: number;
  collection: number;
  balance_delta: number;
};

const ORDER_TOTALS = "delivered_qty, returned_qty, net_amount, collection, balance_delta";

/** Müşterinin o gün verdiği parayı kaydeder. */
export async function saveCollection(orderId: number, collection: number): Promise<ActionResult<OrderTotals>> {
  if (!isId(orderId)) return BAD_INPUT;
  const value = moneyValue(collection);
  if (value == null) return { ok: false, error: "Girilen değer izin verilen aralığın dışında." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ collection: value })
    .eq("id", orderId)
    .select(ORDER_TOTALS)
    .maybeSingle();
  if (error) return { ok: false, error: friendly(error) };
  if (!data) return NO_PERMISSION;

  return { ok: true, data: data as OrderTotals };
}

export type SavedLine = { delivered_qty: number; returned_qty: number; unit_price: number; net_amount: number };

/** Ürün satırındaki verilen/iade adedini kaydeder; satırı ve siparişin yeni toplamlarını döndürür. */
export async function saveLine(
  lineId: number,
  delivered: number,
  returned: number,
): Promise<ActionResult<{ line: SavedLine; order: OrderTotals }>> {
  if (!isId(lineId)) return BAD_INPUT;
  const d = qtyValue(delivered);
  const r = qtyValue(returned);
  if (d == null || r == null) return { ok: false, error: "Girilen değer izin verilen aralığın dışında." };

  const supabase = await createClient();
  const { data: line, error } = await supabase
    .from("order_lines")
    .update({ delivered_qty: d, returned_qty: r })
    .eq("id", lineId)
    .select("order_id, delivered_qty, returned_qty, unit_price, net_amount")
    .maybeSingle();
  if (error) return { ok: false, error: friendly(error) };
  if (!line) return NO_PERMISSION;

  const { data: order } = await supabase.from("orders").select(ORDER_TOTALS).eq("id", line.order_id).maybeSingle();
  return { ok: true, data: { line: line as SavedLine, order: order as OrderTotals } };
}

/** Siparişe müşterinin aldığı bir ürünün satırını ekler. */
export async function addLine(orderId: number, productId: number): Promise<ActionResult> {
  if (!isId(orderId) || !isId(productId)) return BAD_INPUT;

  const supabase = await createClient();
  const { error } = await supabase.from("order_lines").insert({ order_id: orderId, product_id: productId });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

export async function deleteLine(lineId: number): Promise<ActionResult> {
  if (!isId(lineId)) return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase.from("order_lines").delete().eq("id", lineId).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

export async function deleteOrder(id: number): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

// --- Dağıtıcılar (yalnızca yönetici) ------------------------------------------

export async function createDriver(name: string): Promise<ActionResult> {
  const clean = text(name, 60);
  if (!clean) return { ok: false, error: "Dağıtıcı adı gerekli (en çok 60 karakter)." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("drivers")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("drivers").insert({ name: clean, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

export async function renameDriver(id: number, name: string): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  const clean = text(name, 60);
  if (!clean) return { ok: false, error: "Dağıtıcı adı gerekli (en çok 60 karakter)." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("drivers").update({ name: clean }).eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

export async function setDriverActive(id: number, active: boolean): Promise<ActionResult> {
  if (!isId(id) || typeof active !== "boolean") return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .update({ is_active: active })
    .eq("id", id)
    .eq("is_owner", false)
    .select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

// --- Giderler ------------------------------------------------------------------

export type ExpenseInput = {
  date: string;
  place: "driver" | "counter" | "general";
  driverId: number | null;
  /** Cari (müşteri) bağlantısı: veresiye alış ya da cariye ödeme için. */
  customerId?: number | null;
  /** expense: gider; payment: cariye ödeme (gider değil, alacağı kapatır). */
  kind?: "expense" | "payment";
  /** cash: peşin; account: veresiye (müşterinin alacağına yazılır). */
  payment?: "cash" | "account";
  amount: number;
  category: string | null;
  description: string | null;
};

export type SavedExpense = {
  id: number;
  amount: number;
  category: string | null;
  description: string | null;
};

export async function addExpense(input: ExpenseInput): Promise<ActionResult<SavedExpense>> {
  if (typeof input !== "object" || input === null) return BAD_INPUT;
  if (!isISODate(input.date)) return { ok: false, error: "Geçersiz tarih." };
  if (input.place !== "driver" && input.place !== "counter" && input.place !== "general") return BAD_INPUT;
  if (input.place === "driver" && !isId(input.driverId)) return { ok: false, error: "Dağıtıcı seçin." };
  const kind = input.kind ?? "expense";
  const payment = kind === "payment" ? "cash" : (input.payment ?? "cash");
  const customerId = input.customerId ?? null;
  if (kind !== "expense" && kind !== "payment") return BAD_INPUT;
  if (payment !== "cash" && payment !== "account") return BAD_INPUT;
  if (customerId !== null && !isId(customerId)) return BAD_INPUT;
  if ((kind === "payment" || payment === "account") && customerId === null) return { ok: false, error: "Cari (müşteri) seçin." };
  const amount = moneyValue(input.amount);
  if (amount == null || amount <= 0) return { ok: false, error: "Gider tutarı girin." };
  const category = text(input.category, 40);
  const description = text(input.description, 200);
  if (category === undefined || description === undefined) return { ok: false, error: "Açıklama çok uzun." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      entry_date: input.date,
      place: input.place,
      driver_id: input.place === "driver" ? input.driverId : null,
      customer_id: customerId,
      kind,
      payment,
      amount,
      category,
      description,
    })
    .select("id, amount, category, description")
    .single();
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true, data: data as SavedExpense };
}

/** Yeni gider türü (her aktif kullanıcı ekleyebilir). */
export async function createExpenseCategory(name: string): Promise<ActionResult<string>> {
  const n = text(name, 40);
  if (!n) return { ok: false, error: "Gider türünü yazın (en çok 40 karakter)." };

  const supabase = await createClient();
  const { error } = await supabase.from("expense_categories").insert({ name: n, sort_order: 50 });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true, data: n };
}

/** Gider türünü listeden kaldırır (yönetici). Eski giderlerdeki tür yazısı kalır. */
export async function deleteExpenseCategory(id: number): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase.from("expense_categories").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

export async function deleteExpense(id: number): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

// --- Şoför gün sonu ------------------------------------------------------------

export async function saveDriverHandover(
  date: string,
  driverId: number,
  handedOver: number | null,
): Promise<ActionResult> {
  if (!isISODate(date) || !isId(driverId)) return BAD_INPUT;
  const value = handedOver == null ? null : moneyValue(handedOver);
  if (handedOver != null && value == null) return { ok: false, error: "Girilen değer izin verilen aralığın dışında." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("driver_days")
    .upsert({ entry_date: date, driver_id: driverId, handed_over: value }, { onConflict: "entry_date,driver_id" });
  if (error) return { ok: false, error: friendly(error) };

  return { ok: true };
}

// --- Tezgah --------------------------------------------------------------------

/** Tezgahtan gelen ekmek parası (ekmek çeşidi fark etmez). */
export async function saveCounterBread(date: string, amount: number): Promise<ActionResult> {
  if (!isISODate(date)) return BAD_INPUT;
  const value = moneyValue(amount);
  if (value == null) return { ok: false, error: "Tutar izin verilen aralığın dışında." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("counter_days")
    .upsert({ entry_date: date, sales_income: value }, { onConflict: "entry_date" });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

export type CounterSaleInput = { date: string; name: string; qty: number; unitPrice: number };

/** Tezgahta satılan ek ürün (zeytinyağı, yufka …). */
export async function addCounterSale(input: CounterSaleInput): Promise<ActionResult> {
  if (typeof input !== "object" || input === null || !isISODate(input.date)) return BAD_INPUT;
  const name = text(input.name, 60);
  if (!name) return { ok: false, error: "Ürün adını yazın." };
  const qtyNum = typeof input.qty === "number" && Number.isFinite(input.qty) ? Math.round(input.qty * 100) / 100 : NaN;
  if (!(qtyNum > 0 && qtyNum < 100_000)) return { ok: false, error: "Adet girin." };
  const price = moneyValue(input.unitPrice, 999_999);
  if (price == null) return { ok: false, error: "Fiyat girin." };

  // Aynı gün + aynı ürün + aynı fiyat varsa adedi arttırılır (tek satır).
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_counter_sale", { p_date: input.date, p_name: name, p_qty: qtyNum, p_price: price });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

/** Tezgah satırının adedini değiştirir; 0 olursa satır silinir. */
export async function setCounterSaleQty(id: number, qty: number): Promise<ActionResult> {
  if (!isId(id) || typeof qty !== "number" || !Number.isFinite(qty) || qty < 0 || qty >= 100_000) return BAD_INPUT;
  const value = Math.round(qty * 100) / 100;

  const supabase = await createClient();
  const { data, error } =
    value === 0
      ? await supabase.from("counter_sales").delete().eq("id", id).select("id")
      : await supabase.from("counter_sales").update({ qty: value }).eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}

export async function deleteCounterSale(id: number): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase.from("counter_sales").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return NO_PERMISSION;

  refresh();
  return { ok: true };
}
