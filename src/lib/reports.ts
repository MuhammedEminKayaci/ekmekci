// Rapor okumaları (sunucu). Procedure sonuçlarını sayfaların kullandığı biçime çevirir.

import { day, isoDay, num, proc, query, type Row } from "@/lib/db";

export type TotalsRow = {
  period_start: string;
  delivered_qty: number;
  returned_qty: number;
  gross_amount: number;
  return_amount: number;
  net_amount: number;
  collection: number;
  period_delta: number;
  customer_count: number;
};

export async function getTotals(from: string, to: string, group: "day" | "week" | "month" | "year"): Promise<TotalsRow[]> {
  const { sets } = await proc("dbo.sp_Report_Totals", { From: day(from), To: day(to), Group: group });
  return (sets[0] as Row[]).map((r) => ({
    period_start: isoDay(r.PeriodStart)!,
    delivered_qty: num(r.DeliveredQty),
    returned_qty: num(r.ReturnedQty),
    gross_amount: num(r.GrossAmount),
    return_amount: num(r.ReturnAmount),
    net_amount: num(r.NetAmount),
    collection: num(r.Collection),
    period_delta: num(r.PeriodDelta),
    customer_count: num(r.CustomerCount),
  }));
}

export type CustomerPeriodRow = {
  customer_id: number;
  customer_name: string;
  customer_type: number;
  opening_balance: number;
  delivered_qty: number;
  returned_qty: number;
  gross_amount: number;
  return_amount: number;
  net_amount: number;
  collection: number;
  period_delta: number;
  closing_balance: number;
  entry_days: number;
};

export async function getCustomerPeriod(from: string, to: string): Promise<CustomerPeriodRow[]> {
  const { sets } = await proc("dbo.sp_Report_CustomerPeriod", { From: day(from), To: day(to) });
  return (sets[0] as Row[]).map((r) => ({
    customer_id: r.CustomerId,
    customer_name: r.CustomerName,
    customer_type: r.CustomerTypeId,
    opening_balance: num(r.OpeningBalance),
    delivered_qty: num(r.DeliveredQty),
    returned_qty: num(r.ReturnedQty),
    gross_amount: num(r.GrossAmount),
    return_amount: num(r.ReturnAmount),
    net_amount: num(r.NetAmount),
    collection: num(r.Collection),
    period_delta: num(r.PeriodDelta),
    closing_balance: num(r.ClosingBalance),
    entry_days: num(r.EntryDays),
  }));
}

export type CustomerSummary = {
  id: number;
  name: string;
  type: number;
  address: string | null;
  note: string | null;
  is_active: boolean;
  buys_products: boolean;
  created_at: string | null;
  balance: number;
  last_entry_date: string | null;
  products: Array<{ product_id: number; name: string; unit: string; price: number | null; since: string | null }>;
};

/** Aktif ürün kataloğu (müşteriye ürün eklerken). */
export async function getCatalog(): Promise<Array<{ id: number; name: string; unit: string; suggested_price: number | null }>> {
  const rows = await query<Row>(`SELECT ProductId, Name, Unit, SuggestedPrice FROM dbo.Products WHERE IsActive = 1 ORDER BY SortOrder, ProductId`);
  return rows.map((p) => ({ id: p.ProductId, name: p.Name, unit: p.Unit, suggested_price: p.SuggestedPrice == null ? null : num(p.SuggestedPrice) }));
}

/** Müşteri listesi / kartı (vw_CustomerOverview). */
export async function getCustomers(where = "1 = 1", params: Record<string, string | number | boolean | null> = {}): Promise<CustomerSummary[]> {
  const rows = await query<Row>(
    `SELECT CustomerId, Name, CustomerTypeId, Address, Note, IsActive, BuysProducts, CreatedAt, Balance, LastEntryDate, Products
       FROM dbo.vw_CustomerOverview WHERE ${where} ORDER BY Name`,
    params,
  );
  return rows.map((c) => ({
    id: c.CustomerId,
    name: c.Name,
    type: c.CustomerTypeId,
    address: c.Address,
    note: c.Note,
    is_active: c.IsActive,
    buys_products: c.BuysProducts,
    created_at: isoDay(c.CreatedAt),
    balance: num(c.Balance),
    last_entry_date: isoDay(c.LastEntryDate),
    products: (JSON.parse(c.Products || "[]") as Row[]).map((p) => ({
      product_id: p.ProductId,
      name: p.Name,
      unit: p.Unit,
      price: p.Price == null ? null : Number(p.Price),
      since: p.Since ? String(p.Since).slice(0, 10) : null,
    })),
  }));
}
