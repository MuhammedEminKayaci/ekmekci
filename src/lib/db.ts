// MSSQL bağlantısı ve sorgu yardımcıları. Yalnızca sunucuda çalışır.
// Yazma işlemleri her zaman procedure ile yapılır; okumalar view ve procedure'lardan.

import sql from "mssql";
import { connection } from "next/server";

const config: sql.config = {
  server: process.env.MSSQL_SERVER ?? "",
  port: Number(process.env.MSSQL_PORT ?? 1433),
  database: process.env.MSSQL_DATABASE ?? "",
  user: process.env.MSSQL_USER ?? "",
  password: process.env.MSSQL_PASSWORD ?? "",
  options: { encrypt: true, trustServerCertificate: true, useUTC: true, enableArithAbort: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 60_000 },
  connectionTimeout: 30_000,
  requestTimeout: 30_000,
};

// Geliştirmede sıcak yeniden yüklemede tek havuz kalsın.
const g = globalThis as unknown as { __ekmekciPool?: Promise<sql.ConnectionPool> };

function pool(): Promise<sql.ConnectionPool> {
  if (!g.__ekmekciPool) {
    g.__ekmekciPool = new sql.ConnectionPool(config).connect().catch((err) => {
      g.__ekmekciPool = undefined;
      throw err;
    });
  }
  return g.__ekmekciPool;
}

/** Gün parametresi ("YYYY-MM-DD"). DATEFORMAT ayarından bağımsız, saat dilimi kayması olmadan gönderilir. */
export class Day {
  constructor(readonly iso: string) {}
}
export const day = (iso: string) => new Day(iso);

type Param = string | number | boolean | null | undefined | Day;

function bind(req: sql.Request, params: Record<string, Param>) {
  for (const [name, v] of Object.entries(params)) {
    if (v instanceof Day) req.input(name, sql.Date, new Date(`${v.iso}T00:00:00Z`));
    else if (v === null || v === undefined) req.input(name, sql.NVarChar, null);
    else if (typeof v === "boolean") req.input(name, sql.Bit, v);
    else if (typeof v === "number") req.input(name, Number.isInteger(v) ? sql.Int : sql.Decimal(18, 4), v);
    else req.input(name, sql.NVarChar(sql.MAX), v);
  }
}

/** Uygulamanın göstereceği hata: procedure'ların Türkçe mesajları (50000–50099) aynen geçer. */
export class DbError extends Error {}

function translate(err: unknown): never {
  const e = err as { number?: number; message?: string };
  const n = e?.number ?? 0;
  if (n >= 50000 && n < 50100) throw new DbError(e.message ?? "İşlem tamamlanamadı.");
  if (n === 2627 || n === 2601) throw new DbError("Bu kayıt zaten var.");
  if (n === 547) throw new DbError("Girilen değer izin verilen aralığın dışında.");
  console.error("[db]", err);
  throw new DbError("İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");
}

/**
 * Havuz bağlanamadıysa bir kez daha bağlanmayı dener. Yalnızca istek GÖNDERİLMEDEN önceki
 * bağlantı hatasında tekrar edilir; istek gittikten sonraki hata asla tekrarlanmaz
 * (bir yazma işlemi iki kez çalışmasın).
 */
async function withRetry<T>(fn: (p: sql.ConnectionPool) => Promise<T>): Promise<T> {
  let p: sql.ConnectionPool;
  try {
    p = await pool();
    if (!p.connected) throw new sql.ConnectionError("Havuz bağlı değil.");
  } catch {
    const old = g.__ekmekciPool;
    g.__ekmekciPool = undefined;
    old?.then((x) => x.close()).catch(() => {});
    p = await pool();
  }
  return fn(p);
}

/** Parametreli sorgu; ilk sonuç kümesini döndürür. */
export async function query<T = Record<string, unknown>>(text: string, params: Record<string, Param> = {}): Promise<T[]> {
  await connection();
  try {
    return await withRetry(async (p) => {
      const req = p.request();
      bind(req, params);
      const r = await req.query<T>(text);
      return r.recordset ?? [];
    });
  } catch (err) {
    translate(err);
  }
}

/** Procedure çağrısı; bütün sonuç kümelerini ve çıkış parametrelerini döndürür. */
export async function proc(
  name: string,
  params: Record<string, Param> = {},
  outputs: string[] = [],
): Promise<{ sets: Record<string, unknown>[][]; out: Record<string, unknown> }> {
  await connection();
  try {
    return await withRetry(async (p) => {
      const req = p.request();
      bind(req, params);
      for (const o of outputs) req.output(o, sql.Int);
      const r = await req.execute(name);
      return { sets: (r.recordsets as unknown as Record<string, unknown>[][]) ?? [], out: r.output ?? {} };
    });
  } catch (err) {
    translate(err);
  }
}

/** Sorgu satırı: kolon adları veritabanındaki gibi (PascalCase); sayfalar kendi tiplerine çevirir. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

/** Veritabanının güncel veri sürümü (her yazımda artar). İstek dışında, arka plan döngüsünden çağrılır. */
export async function dataVersion(): Promise<number> {
  return withRetry(async (p) => {
    const r = await p.request().execute("dbo.sp_Data_Version");
    return Number(r.recordset?.[0]?.Version ?? 0);
  });
}

/** Sunucu açılırken havuzu kurar (ilk kullanıcı bağlantı süresini beklemesin). */
export async function warmUp(): Promise<void> {
  await pool();
}

/** smalldatetime → "YYYY-MM-DD" */
export function isoDay(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
}

/** smalldatetime → "YYYY-MM-DDTHH:MM" (Türkiye saati, olduğu gibi) */
export function isoTime(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 16);
}

/** decimal → number */
export const num = (v: unknown): number => Number(v ?? 0);
