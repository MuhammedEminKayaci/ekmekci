"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addDays, isISODate, parseAmount } from "@/lib/format";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

type PgError = { code?: string; message: string; details?: string | null };

function friendly(err: PgError): string {
  if (err.code === "23505" && err.message.includes("customers_name_unique")) {
    return "Bu isimde bir müşteri zaten var.";
  }
  if (err.code === "23505" && err.message.includes("drivers_name_unique")) {
    return "Bu isimde bir dağıtıcı zaten var.";
  }
  if (err.code === "23505" && err.message.includes("orders_customer_day")) {
    return "Bu müşteri o gün bu dağıtıcının listesinde zaten var.";
  }
  if (err.code === "23514") return "Girilen değer izin verilen aralığın dışında.";
  if (err.code === "42501") return "Bu işlem için yetkiniz yok.";
  if (err.code === "P0001") return err.message;
  return "İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.";
}

// --- Oturum ------------------------------------------------------------------

export type LoginState = { error?: string; email?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "E-posta ve şifre gerekli.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "E-posta veya şifre hatalı.", email };

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/giris");
}

// --- Müşteriler --------------------------------------------------------------

function readCustomerForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = Number(formData.get("type")) === 2 ? 2 : 1;
  const address = String(formData.get("address") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  return { name, type, address, note };
}

export async function createCustomer(formData: FormData): Promise<ActionResult<number>> {
  const { name, type, address, note } = readCustomerForm(formData);
  const price = parseAmount(formData.get("price"));
  if (!name) return { ok: false, error: "Müşteri adı gerekli." };
  if (price == null || price <= 0) return { ok: false, error: "Geçerli bir ekmek fiyatı girin." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_customer", {
    p_type: type,
    p_name: name,
    p_price: price,
    p_address: address ?? undefined,
    p_note: note ?? undefined,
  });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true, data };
}

export async function updateCustomer(id: number, formData: FormData): Promise<ActionResult> {
  const { name, type, address, note } = readCustomerForm(formData);
  if (!name) return { ok: false, error: "Müşteri adı gerekli." };

  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ name, type, address, note }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

export async function setCustomerActive(id: number, active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

export async function setCustomerPrice(id: number, formData: FormData): Promise<ActionResult> {
  const price = parseAmount(formData.get("price"));
  const validFrom = String(formData.get("valid_from") ?? "");
  if (price == null || price <= 0) return { ok: false, error: "Geçerli bir fiyat girin." };
  if (!isISODate(validFrom)) return { ok: false, error: "Geçerli bir başlangıç tarihi seçin." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_customer_price", {
    p_customer_id: id,
    p_price: price,
    p_valid_from: validFrom,
  });
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

// --- Siparişler --------------------------------------------------------------

type Db = Awaited<ReturnType<typeof createClient>>;

/** Dağıtıcı verilmezse işletme sahibinin ("Ben") kendi dağıtımı kullanılır. */
async function resolveDriver(supabase: Db, driverId?: number): Promise<number | null> {
  if (driverId && Number.isInteger(driverId) && driverId > 0) return driverId;
  const { data } = await supabase.from("drivers").select("id").eq("is_owner", true).maybeSingle();
  return data?.id ?? null;
}

export async function addCustomersToDay(
  date: string,
  customerIds: number[],
  driverId?: number,
): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  const ids = [...new Set(customerIds.filter((n) => Number.isInteger(n) && n > 0))];
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

  const { error } = await supabase
    .from("orders")
    .upsert(
      ids.map((customer_id, i) => ({ customer_id, entry_date: date, driver_id: driver, sort_order: base + i + 1 })),
      { onConflict: "customer_id,entry_date,driver_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

/** Günün listesini verilen sırayla kaydeder (ids[0] en üstte). */
export async function reorderDay(date: string, orderIds: number[]): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  const ids = orderIds.filter((n) => Number.isInteger(n) && n > 0);
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

export type OrderPatch = { delivered_qty: number; returned_qty: number; collection: number };

export type SavedOrder = OrderPatch & {
  unit_price: number;
  net_amount: number;
  balance_delta: number;
};

export async function saveOrder(id: number, patch: OrderPatch): Promise<ActionResult<SavedOrder>> {
  const clean = {
    delivered_qty: Math.max(0, Math.trunc(Number(patch.delivered_qty) || 0)),
    returned_qty: Math.max(0, Math.trunc(Number(patch.returned_qty) || 0)),
    collection: Math.max(0, Math.round((Number(patch.collection) || 0) * 100) / 100),
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update(clean)
    .eq("id", id)
    .select("delivered_qty, returned_qty, collection, unit_price, net_amount, balance_delta")
    .single();
  if (error) return { ok: false, error: friendly(error) };

  return { ok: true, data: data as SavedOrder };
}

export async function deleteOrder(id: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

// --- Dağıtıcılar ---------------------------------------------------------------

export async function createDriver(name: string): Promise<ActionResult> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return { ok: false, error: "Dağıtıcı adı gerekli." };

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
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return { ok: false, error: "Dağıtıcı adı gerekli." };

  const supabase = await createClient();
  const { error } = await supabase.from("drivers").update({ name: clean }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

export async function setDriverActive(id: number, active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("drivers").update({ is_active: active }).eq("id", id).eq("is_owner", false);
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

// --- Giderler ------------------------------------------------------------------

export type ExpenseInput = {
  date: string;
  place: "driver" | "counter";
  driverId: number | null;
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
  if (!isISODate(input.date)) return { ok: false, error: "Geçersiz tarih." };
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (amount <= 0) return { ok: false, error: "Gider tutarı girin." };
  if (input.place === "driver" && !input.driverId) return { ok: false, error: "Dağıtıcı seçin." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      entry_date: input.date,
      place: input.place,
      driver_id: input.place === "driver" ? input.driverId : null,
      amount,
      category: input.category?.trim() || null,
      description: input.description?.trim() || null,
    })
    .select("id, amount, category, description")
    .single();
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true, data: data as SavedExpense };
}

export async function deleteExpense(id: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

// --- Şoför gün sonu ------------------------------------------------------------

export async function saveDriverHandover(
  date: string,
  driverId: number,
  handedOver: number | null,
): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  const value = handedOver == null ? null : Math.max(0, Math.round(Number(handedOver) * 100) / 100);

  const supabase = await createClient();
  const { error } = await supabase
    .from("driver_days")
    .upsert({ entry_date: date, driver_id: driverId, handed_over: value }, { onConflict: "entry_date,driver_id" });
  if (error) return { ok: false, error: friendly(error) };

  return { ok: true };
}

// --- Tezgah --------------------------------------------------------------------

export type CounterPatch = {
  opening_cash: number;
  breads_in: number;
  breads_left: number;
  bread_price: number | null;
  sales_income: number;
  closing_cash: number;
  handed_over: number | null;
  note: string | null;
};

export async function saveCounterDay(date: string, patch: CounterPatch): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  const money = (v: number | null) => (v == null ? null : Math.max(0, Math.round(Number(v) * 100) / 100));
  const int = (v: number) => Math.max(0, Math.trunc(Number(v) || 0));

  const supabase = await createClient();
  const { error } = await supabase.from("counter_days").upsert(
    {
      entry_date: date,
      opening_cash: money(patch.opening_cash) ?? 0,
      breads_in: int(patch.breads_in),
      breads_left: int(patch.breads_left),
      bread_price: patch.bread_price && patch.bread_price > 0 ? money(patch.bread_price) : null,
      sales_income: money(patch.sales_income) ?? 0,
      closing_cash: money(patch.closing_cash) ?? 0,
      handed_over: money(patch.handed_over),
      note: patch.note?.trim() || null,
    },
    { onConflict: "entry_date" },
  );
  if (error) return { ok: false, error: friendly(error) };

  return { ok: true };
}

export async function setCounterDefaultPrice(price: number): Promise<ActionResult> {
  const value = Math.round((Number(price) || 0) * 100) / 100;
  if (value <= 0) return { ok: false, error: "Geçerli bir fiyat girin." };

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").update({ counter_bread_price: value }).eq("id", true);
  if (error) return { ok: false, error: friendly(error) };

  return { ok: true };
}
