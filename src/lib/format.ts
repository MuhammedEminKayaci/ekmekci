// Para, sayı ve tarih biçimleri. Tarihler "YYYY-MM-DD" metni olarak dolaşır;
// saat dilimi kaymasını önlemek için hesaplar UTC gece yarısı üzerinden yapılır.

const moneyWhole = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qtyFmt = new Intl.NumberFormat("tr-TR");

/** Tam tutarlar kuruşsuz ("1.250 ₺"), kuruşlu tutarlar iki haneli ("49,50 ₺"). */
export function money(value: number | null | undefined): string {
  const v = Math.round(Number(value ?? 0) * 100) / 100;
  return `${(Number.isInteger(v) ? moneyWhole : moneyCents).format(v)} ₺`;
}

const compactFmt = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

/** Eksen etiketleri için kısa tutar: "15,4 B ₺". */
export function moneyShort(value: number): string {
  return `${compactFmt.format(value)} ₺`;
}

/** Yüzde değişim; önceki değer 0 ise null. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function qty(value: number | null | undefined): string {
  return qtyFmt.format(Number(value ?? 0));
}

/** Bakiye yönü: + borçlu, − alacaklı. */
export type BalanceTone = "debt" | "credit" | "zero";

export function balanceTone(value: number | null | undefined): BalanceTone {
  const v = Number(value ?? 0);
  if (v > 0.004) return "debt";
  if (v < -0.004) return "credit";
  return "zero";
}

export function balanceLabel(value: number | null | undefined): string {
  const tone = balanceTone(value);
  if (tone === "debt") return "Borçlu";
  if (tone === "credit") return "Alacaklı";
  return "Hesap kapalı";
}

/** Kullanıcı girişini sayıya çevirir: "1.250,50" ve "1250.5" ikisi de kabul. */
export function parseAmount(raw: FormDataEntryValue | string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s|₺/g, "");
  if (s === "") return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// --- Tarihler ---------------------------------------------------------------

const TZ = "Europe/Istanbul";

export function todayTR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toUTC(v).getTime());
}

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function addMonths(iso: string, months: number): string {
  const d = toUTC(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toISO(d);
}

/** Haftanın pazartesisi. */
export function weekStart(iso: string): string {
  const d = toUTC(iso);
  const dow = (d.getUTCDay() + 6) % 7; // pazartesi = 0
  return addDays(iso, -dow);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("tr-TR", { ...opts, timeZone: "UTC" });
    fmtCache.set(key, f);
  }
  return f;
}

/** "7 Ekim 2026" */
export function longDate(iso: string): string {
  return fmt({ day: "numeric", month: "long", year: "numeric" }).format(toUTC(iso));
}

/** "7 Eki" */
export function shortDate(iso: string): string {
  return fmt({ day: "numeric", month: "short" }).format(toUTC(iso));
}

/** "Çarşamba" */
export function weekdayLong(iso: string): string {
  return fmt({ weekday: "long" }).format(toUTC(iso));
}

/** "Çar" */
export function weekdayShort(iso: string): string {
  return fmt({ weekday: "short" }).format(toUTC(iso));
}

/** "Ekim 2026" */
export function monthLabel(iso: string): string {
  return fmt({ month: "long", year: "numeric" }).format(toUTC(iso));
}

/** "5 – 11 Ekim 2026" ya da "29 Eyl – 5 Eki 2026" */
export function weekRangeLabel(start: string): string {
  const end = addDays(start, 6);
  const a = toUTC(start);
  const b = toUTC(end);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()} – ${fmt({ day: "numeric", month: "long", year: "numeric" }).format(b)}`;
  }
  return `${shortDate(start)} – ${fmt({ day: "numeric", month: "short", year: "numeric" }).format(b)}`;
}
