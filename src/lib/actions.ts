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
  if (err.code === "23505" && err.message.includes("orders_customer_day_unique")) {
    return "Bu müşteri o gün için zaten listede.";
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

export async function addCustomersToDay(date: string, customerIds: number[]): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };
  const ids = [...new Set(customerIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { ok: false, error: "En az bir müşteri seçin." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .upsert(
      ids.map((customer_id) => ({ customer_id, entry_date: date })),
      { onConflict: "customer_id,entry_date", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: friendly(error) };

  refresh();
  return { ok: true };
}

/** Geçen haftanın aynı gününde listede olan aktif müşterileri bu güne ekler. */
export async function copyDayFromLastWeek(date: string): Promise<ActionResult<number>> {
  if (!isISODate(date)) return { ok: false, error: "Geçersiz tarih." };

  const supabase = await createClient();
  const { data: prev, error: readErr } = await supabase
    .from("orders")
    .select("customer_id, customers!inner(is_active)")
    .eq("entry_date", addDays(date, -7))
    .eq("customers.is_active", true);
  if (readErr) return { ok: false, error: friendly(readErr) };
  if (!prev?.length) return { ok: false, error: "Geçen haftanın bu gününde kayıt yok." };

  const res = await addCustomersToDay(
    date,
    prev.map((r) => r.customer_id),
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
