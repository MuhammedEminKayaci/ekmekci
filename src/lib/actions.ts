"use server";

// Bütün yazma işlemleri MSSQL procedure'larıyla yapılır. Procedure'lar kullanıcının aktif
// (gerekirse yönetici) olduğunu, geçmiş hafta kilidini ve iş kurallarını kendisi denetler.
// Server Action'lar dışarıdan doğrudan çağrılabildiği için TypeScript tiplerine güvenilmez:
// her parametre burada da çalışma anında doğrulanır.

import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, cookieOptions, createToken } from "@/lib/auth";
import { DbError, day, proc, query } from "@/lib/db";
import { isISODate, parseAmount } from "@/lib/format";
import { getSessionProfile } from "@/lib/session";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const BAD_INPUT = { ok: false, error: "Geçersiz istek." } as const;
const NO_SESSION = { ok: false, error: "Oturumunuz kapanmış. Sayfayı yenileyip tekrar giriş yapın." } as const;
const MAX_MONEY = 9_999_999;

/** Oturumdaki aktif kullanıcının kimliği; yoksa null. */
async function userId(): Promise<number | null> {
  const p = await getSessionProfile();
  return p?.isActive ? p.id : null;
}

/** İşlemi çalıştırır; veritabanının Türkçe hata mesajını sonuca çevirir. */
async function run<T>(fn: (uid: number) => Promise<T>): Promise<ActionResult<T>> {
  const uid = await userId();
  if (!uid) return NO_SESSION;
  try {
    const data = await fn(uid);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DbError) return { ok: false, error: err.message };
    console.error("[action]", err);
    return { ok: false, error: "İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin." };
  }
}

// --- Girdi doğrulama ---------------------------------------------------------

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 2147483647;

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

/** Metni kırpar; uzunluk sınırını aşarsa ya da metin değilse undefined, boşsa null. */
function text(v: unknown, max: number): string | null | undefined {
  if (v == null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s+/g, " ");
  if (s.length > max) return undefined;
  return s || null;
}

// --- Oturum ------------------------------------------------------------------

// Basit deneme sınırı: aynı adres + e-posta için 10 dakikada en çok 8 hatalı deneme.
const attempts = new Map<string, { n: number; until: number }>();

export type SignInState = { error: string | null };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password || email.length > 254 || password.length > 128) return { error: "E-posta ve şifre gerekli." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "yerel";
  const key = `${ip}|${email}`;
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= 8) return { error: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." };

  let user: { UserId: number; PasswordHash: string | null; IsActive: boolean } | undefined;
  try {
    user = (await proc("dbo.sp_User_GetForLogin", { Email: email })).sets[0]?.[0] as typeof user;
  } catch {
    return { error: "Sunucuya bağlanılamadı. Biraz sonra tekrar deneyin." };
  }
  // Kullanıcı yoksa da bcrypt çalışır: yanıt süresi kullanıcının var olup olmadığını ele vermesin.
  const ok = await bcrypt.compare(password, user?.PasswordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !ok) {
    attempts.set(key, { n: (a && a.until > now ? a.n : 0) + 1, until: now + 10 * 60_000 });
    return { error: "E-posta veya şifre hatalı." };
  }
  attempts.delete(key);
  if (!user.IsActive) return { error: "Hesabınız henüz aktif değil. Yöneticinizden hesabınızı açmasını isteyin." };

  await proc("dbo.sp_User_RecordLogin", { UserId: user.UserId });
  (await cookies()).set(SESSION_COOKIE, createToken(user.UserId), cookieOptions);
  redirect("/");
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
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
function readProductPrices(raw: FormDataEntryValue | null): Array<{ productId: number; price: number }> | null {
  if (typeof raw !== "string" || raw.length > 5000) return null;
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length > 50) return null;
  const out: Array<{ productId: number; price: number }> = [];
  const seen = new Set<number>();
  for (const item of list) {
    if (typeof item !== "object" || item === null) return null;
    const { product_id, price } = item as { product_id: unknown; price: unknown };
    const value = moneyValue(price, 99_999);
    if (!isId(product_id) || value == null || value <= 0 || seen.has(product_id)) return null;
    seen.add(product_id);
    out.push({ productId: product_id, price: value });
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

  const res = await run(async (uid) => {
    const { out } = await proc(
      "dbo.sp_Customer_Create",
      { UserId: uid, CustomerTypeId: type, Name: name, Address: address, Note: note, BuysProducts: buys, Products: JSON.stringify(products) },
      ["CustomerId"],
    );
    return Number(out.CustomerId);
  });
  if (res.ok) refresh();
  return res;
}

export async function updateCustomer(id: number, formData: FormData): Promise<ActionResult> {
  if (!isId(id) || !(formData instanceof FormData)) return BAD_INPUT;
  const { name, type, address, note } = readCustomerForm(formData);
  if (!name) return { ok: false, error: "Müşteri adı gerekli (en çok 120 karakter)." };
  if (address === undefined || note === undefined) return { ok: false, error: "Adres ya da not çok uzun." };
  const buysRaw = formData.get("buys_products");
  const buys = buysRaw === "0" ? false : buysRaw === "1" ? true : null;

  const res = await run(async (uid) => {
    await proc("dbo.sp_Customer_Update", { UserId: uid, CustomerId: id, CustomerTypeId: type, Name: name, Address: address, Note: note, BuysProducts: buys });
  });
  if (res.ok) refresh();
  return res;
}

export async function setCustomerActive(id: number, active: boolean): Promise<ActionResult> {
  if (!isId(id) || typeof active !== "boolean") return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_Customer_SetActive", { UserId: uid, CustomerId: id, IsActive: active });
  });
  if (res.ok) refresh();
  return res;
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

  const res = await run(async (uid) => {
    await proc("dbo.sp_CustomerPrice_Set", { UserId: uid, CustomerId: id, ProductId: productId, Price: price, ValidFrom: day(validFrom) });
  });
  if (res.ok) refresh();
  return res;
}

/** Ürünü müşterinin listesinden çıkarır (geçmiş satışlar ve fiyat geçmişi korunur). */
export async function removeCustomerProduct(customerId: number, productId: number): Promise<ActionResult> {
  if (!isId(customerId) || !isId(productId)) return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_CustomerProduct_Remove", { UserId: uid, CustomerId: customerId, ProductId: productId });
  });
  if (res.ok) refresh();
  return res;
}

// --- Ürünler (yalnızca yönetici) ------------------------------------------------

export type ProductInput = { name: string; unit: string; suggested_price: number | null; category_id: number };

function readProduct(input: unknown): ProductInput | null {
  if (typeof input !== "object" || input === null) return null;
  const { name, unit, suggested_price, category_id } = input as ProductInput;
  const n = text(name, 60);
  const u = text(unit, 12) ?? "adet";
  const price = suggested_price == null ? null : moneyValue(suggested_price, 99_999);
  if (!n || u === undefined || !isId(category_id) || (suggested_price != null && (price == null || price <= 0))) return null;
  return { name: n, unit: u, suggested_price: price, category_id };
}

async function saveProduct(id: number | null, input: ProductInput): Promise<ActionResult> {
  const p = readProduct(input);
  if (!p) return { ok: false, error: "Ürün adı ve türü gerekli; birim ve öneri fiyatı geçerli olmalı." };
  const res = await run(async (uid) => {
    await proc("dbo.sp_Product_Save", {
      UserId: uid, ProductId: id, CategoryId: p.category_id, Name: p.name, Unit: p.unit, SuggestedPrice: p.suggested_price,
    });
  });
  if (res.ok) refresh();
  return res;
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  return saveProduct(null, input);
}

export async function updateProduct(id: number, input: ProductInput): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  return saveProduct(id, input);
}

export async function setProductActive(id: number, active: boolean): Promise<ActionResult> {
  if (!isId(id) || typeof active !== "boolean") return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_Product_SetActive", { UserId: uid, ProductId: id, IsActive: active });
  });
  if (res.ok) refresh();
  return res;
}

// --- Ürün türleri (yalnızca yönetici) -------------------------------------------

export type CategoryInput = { name: string; is_bread: boolean; color: string };

// dbo.Colors kimlikleri (01_tablolar.sql ile aynı sıra).
const COLOR_IDS: Record<string, number> = {
  amber: 1, emerald: 2, sky: 3, violet: 4, rose: 5, orange: 6, teal: 7, indigo: 8, lime: 9, fuchsia: 10,
};

function readCategory(input: unknown): (CategoryInput & { colorId: number }) | null {
  if (typeof input !== "object" || input === null) return null;
  const { name, is_bread, color } = input as CategoryInput;
  const n = text(name, 40);
  if (!n || typeof is_bread !== "boolean" || typeof color !== "string" || !(color in COLOR_IDS)) return null;
  return { name: n, is_bread, color, colorId: COLOR_IDS[color] };
}

async function saveCategory(id: number | null, input: CategoryInput): Promise<ActionResult> {
  const c = readCategory(input);
  if (!c) return { ok: false, error: "Tür adını yazın." };
  const res = await run(async (uid) => {
    await proc("dbo.sp_Category_Save", { UserId: uid, CategoryId: id, Name: c.name, IsBread: c.is_bread, ColorId: c.colorId });
  });
  if (res.ok) refresh();
  return res;
}

export async function createCategory(input: CategoryInput): Promise<ActionResult> {
  return saveCategory(null, input);
}

export async function updateCategory(id: number, input: CategoryInput): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  return saveCategory(id, input);
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_Category_Delete", { UserId: uid, CategoryId: id });
  });
  if (res.ok) refresh();
  return res;
}

// --- Siparişler --------------------------------------------------------------

export async function addCustomersToDay(date: string, customerIds: number[], driverId?: number): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  if (driverId != null && !isId(driverId)) return BAD_INPUT;
  const ids = idList(customerIds);
  if (!ids) return BAD_INPUT;
  if (ids.length === 0) return { ok: false, error: "En az bir müşteri seçin." };

  const res = await run(async (uid) => {
    await proc("dbo.sp_Order_AddCustomers", { UserId: uid, Date: day(date), DriverId: driverId ?? null, CustomerIds: JSON.stringify(ids) });
  });
  if (res.ok) refresh();
  return res;
}

/** Günün listesini verilen sırayla kaydeder (ids[0] en üstte). */
export async function reorderDay(date: string, orderIds: number[]): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  const ids = idList(orderIds);
  if (!ids) return BAD_INPUT;
  if (ids.length === 0) return { ok: true };

  const res = await run(async (uid) => {
    await proc("dbo.sp_Order_Reorder", { UserId: uid, Date: day(date), OrderIds: JSON.stringify(ids) });
  });
  if (res.ok) refresh();
  return res;
}

/** Dağıtıcının geçen haftanın aynı günündeki listesini (aynı sırayla) bu güne ekler. */
export async function copyDayFromLastWeek(date: string, driverId?: number): Promise<ActionResult<number>> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  if (driverId != null && !isId(driverId)) return BAD_INPUT;

  const res = await run(async (uid) => {
    const { out } = await proc("dbo.sp_Order_CopyLastWeek", { UserId: uid, Date: day(date), DriverId: driverId ?? null }, ["Found"]);
    return Number(out.Found ?? 0);
  });
  if (res.ok) refresh();
  return res;
}

/** Siparişin güncel toplamları (satırlar ve tahsilat değiştikçe veritabanı yeniden hesaplar). */
export type OrderTotals = {
  delivered_qty: number;
  returned_qty: number;
  net_amount: number;
  collection: number;
  balance_delta: number;
};

/** Müşterinin o gün verdiği parayı kaydeder. */
export async function saveCollection(orderId: number, collection: number): Promise<ActionResult<OrderTotals>> {
  if (!isId(orderId)) return BAD_INPUT;
  const value = moneyValue(collection);
  if (value == null) return { ok: false, error: "Girilen değer izin verilen aralığın dışında." };

  return run(async (uid) => {
    const { sets } = await proc("dbo.sp_Order_SetCollection", { UserId: uid, OrderId: orderId, Collection: value });
    const o = sets[0][0] as Record<string, number>;
    return {
      delivered_qty: Number(o.DeliveredQty), returned_qty: Number(o.ReturnedQty), net_amount: Number(o.NetAmount),
      collection: Number(o.Collection), balance_delta: Number(o.BalanceDelta),
    };
  });
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

  return run(async (uid) => {
    const { sets } = await proc("dbo.sp_OrderLine_Save", { UserId: uid, OrderLineId: lineId, DeliveredQty: d, ReturnedQty: r });
    const x = sets[0][0] as Record<string, number>;
    return {
      line: { delivered_qty: Number(x.DeliveredQty), returned_qty: Number(x.ReturnedQty), unit_price: Number(x.UnitPrice), net_amount: Number(x.LineNetAmount) },
      order: {
        delivered_qty: Number(x.OrderDeliveredQty), returned_qty: Number(x.OrderReturnedQty), net_amount: Number(x.OrderNetAmount),
        collection: Number(x.Collection), balance_delta: Number(x.BalanceDelta),
      },
    };
  });
}

/** Siparişe müşterinin aldığı bir ürünün satırını ekler. */
export async function addLine(orderId: number, productId: number): Promise<ActionResult> {
  if (!isId(orderId) || !isId(productId)) return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_OrderLine_Add", { UserId: uid, OrderId: orderId, ProductId: productId });
  });
  if (res.ok) refresh();
  return res;
}

export async function deleteLine(lineId: number): Promise<ActionResult> {
  if (!isId(lineId)) return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_OrderLine_Delete", { UserId: uid, OrderLineId: lineId });
  });
  if (res.ok) refresh();
  return res;
}

export async function deleteOrder(id: number): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_Order_Delete", { UserId: uid, OrderId: id });
  });
  if (res.ok) refresh();
  return res;
}

// --- Dağıtıcılar (yalnızca yönetici) ------------------------------------------

export async function createDriver(name: string): Promise<ActionResult> {
  const clean = text(name, 60);
  if (!clean) return { ok: false, error: "Dağıtıcı adı gerekli (en çok 60 karakter)." };
  const res = await run(async (uid) => {
    await proc("dbo.sp_Driver_Save", { UserId: uid, DriverId: null, Name: clean });
  });
  if (res.ok) refresh();
  return res;
}

export async function renameDriver(id: number, name: string): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  const clean = text(name, 60);
  if (!clean) return { ok: false, error: "Dağıtıcı adı gerekli (en çok 60 karakter)." };
  const res = await run(async (uid) => {
    await proc("dbo.sp_Driver_Save", { UserId: uid, DriverId: id, Name: clean });
  });
  if (res.ok) refresh();
  return res;
}

export async function setDriverActive(id: number, active: boolean): Promise<ActionResult> {
  if (!isId(id) || typeof active !== "boolean") return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_Driver_SetActive", { UserId: uid, DriverId: id, IsActive: active });
  });
  if (res.ok) refresh();
  return res;
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
  /** Gider türünün adı (ExpenseCategories.Name). */
  category: string | null;
  description: string | null;
};

export type SavedExpense = { id: number; amount: number; category: string | null; description: string | null };

const PLACE_IDS = { general: 1, counter: 2, driver: 3 } as const;

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
  const category = kind === "payment" ? null : text(input.category, 40);
  const description = text(input.description, 200);
  if (category === undefined || description === undefined) return { ok: false, error: "Açıklama çok uzun." };

  return run(async (uid) => {
    let categoryId: number | null = null;
    if (category) {
      const found = await query<{ ExpenseCategoryId: number }>(
        "SELECT ExpenseCategoryId FROM dbo.ExpenseCategories WHERE Name = @Name", { Name: category });
      if (found[0]) categoryId = found[0].ExpenseCategoryId;
      else {
        const { out } = await proc("dbo.sp_ExpenseCategory_Create", { UserId: uid, Name: category }, ["ExpenseCategoryId"]);
        categoryId = Number(out.ExpenseCategoryId);
      }
    }
    const { out } = await proc(
      "dbo.sp_Expense_Add",
      {
        UserId: uid, Date: day(input.date), ExpensePlaceId: PLACE_IDS[input.place],
        DriverId: input.place === "driver" ? input.driverId : null, CustomerId: customerId,
        ExpenseKindId: kind === "payment" ? 2 : 1, PaymentMethodId: payment === "account" ? 2 : 1,
        ExpenseCategoryId: categoryId, Amount: amount, Description: description,
      },
      ["ExpenseId"],
    );
    refresh();
    return { id: Number(out.ExpenseId), amount, category, description };
  });
}

/** Yeni gider türü (her aktif kullanıcı ekleyebilir). Türün adını döndürür. */
export async function createExpenseCategory(name: string): Promise<ActionResult<string>> {
  const n = text(name, 40);
  if (!n) return { ok: false, error: "Gider türünü yazın (en çok 40 karakter)." };
  const res = await run(async (uid) => {
    await proc("dbo.sp_ExpenseCategory_Create", { UserId: uid, Name: n });
    return n;
  });
  if (res.ok) refresh();
  return res;
}

/** Gider türünü listeden kaldırır (yönetici). Eski giderler türünü korur. */
export async function deleteExpenseCategory(id: number): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_ExpenseCategory_Deactivate", { UserId: uid, ExpenseCategoryId: id });
  });
  if (res.ok) refresh();
  return res;
}

export async function deleteExpense(id: number): Promise<ActionResult> {
  if (!isId(id)) return BAD_INPUT;
  const res = await run(async (uid) => {
    await proc("dbo.sp_Expense_Delete", { UserId: uid, ExpenseId: id });
  });
  if (res.ok) refresh();
  return res;
}

// --- Şoför gün sonu ------------------------------------------------------------

export async function saveDriverHandover(date: string, driverId: number, handedOver: number | null): Promise<ActionResult> {
  if (!isISODate(date) || !isId(driverId)) return BAD_INPUT;
  const value = handedOver == null ? null : moneyValue(handedOver);
  if (handedOver != null && value == null) return { ok: false, error: "Girilen değer izin verilen aralığın dışında." };
  return run(async (uid) => {
    await proc("dbo.sp_DriverDay_SaveHandover", { UserId: uid, Date: day(date), DriverId: driverId, HandedOver: value });
  });
}

// --- Tezgah --------------------------------------------------------------------

/** Tezgahtan gelen ekmek parası (ekmek çeşidi fark etmez). */
export async function saveCounterBread(date: string, amount: number): Promise<ActionResult> {
  if (!isISODate(date)) return BAD_INPUT;
  const value = moneyValue(amount);
  if (value == null) return { ok: false, error: "Tutar izin verilen aralığın dışında." };
  const res = await run(async (uid) => {
    await proc("dbo.sp_CounterDay_SaveBread", { UserId: uid, Date: day(date), SalesIncome: value });
  });
  if (res.ok) refresh();
  return res;
}

export type CounterSaleInput = { date: string; name: string; qty: number; unitPrice: number };

/** Tezgahta satılan ek ürün (zeytinyağı, yufka …). Aynı gün + ad + fiyat tek satırda toplanır. */
export async function addCounterSale(input: CounterSaleInput): Promise<ActionResult> {
  if (typeof input !== "object" || input === null || !isISODate(input.date)) return BAD_INPUT;
  const name = text(input.name, 60);
  if (!name) return { ok: false, error: "Ürün adını yazın." };
  const qtyNum = typeof input.qty === "number" && Number.isFinite(input.qty) ? Math.round(input.qty * 100) / 100 : NaN;
  if (!(qtyNum > 0 && qtyNum < 100_000)) return { ok: false, error: "Adet girin." };
  const price = moneyValue(input.unitPrice, 999_999);
  if (price == null) return { ok: false, error: "Fiyat girin." };

  const res = await run(async (uid) => {
    await proc("dbo.sp_CounterSale_Add", { UserId: uid, Date: day(input.date), Name: name, Qty: qtyNum, UnitPrice: price });
  });
  if (res.ok) refresh();
  return res;
}

/** Tezgah satırının adedini değiştirir; 0 olursa satır silinir. */
export async function setCounterSaleQty(id: number, qty: number): Promise<ActionResult> {
  if (!isId(id) || typeof qty !== "number" || !Number.isFinite(qty) || qty < 0 || qty >= 100_000) return BAD_INPUT;
  const value = Math.round(qty * 100) / 100;
  const res = await run(async (uid) => {
    await proc("dbo.sp_CounterSale_SetQty", { UserId: uid, CounterSaleId: id, Qty: value });
  });
  if (res.ok) refresh();
  return res;
}

export async function deleteCounterSale(id: number): Promise<ActionResult> {
  return setCounterSaleQty(id, 0);
}
