// Siparişler ekranının Excel çıktıları: günün listesi ve şoför hesabı.

import {
  FMT,
  XL,
  a4Sheet,
  bodyCell,
  fileSafe,
  headerRow,
  newWorkbook,
  saveWorkbook,
  sectionTitle,
  signatureRow,
  summaryRow,
  titleRows,
  totalRowStyle,
} from "@/lib/excel";
import { longDate, weekdayLong } from "@/lib/format";

export type ExportRow = {
  name: string;
  delivered: number;
  returned: number;
  collection: number;
  total: number; // + borç, − alacak
};

const BLANK_ROWS_WHEN_EMPTY = 20;

/** Değer yoksa boş hücre: liste elle doldurulabilsin. */
const orBlank = (v: number) => (v ? v : null);

/** Günün listesi. `label` verilirse (ör. "Ömer") başlığa ve dosya adına eklenir. */
export async function downloadDayList(day: string, rows: ExportRow[], label?: string) {
  const wb = await newWorkbook();
  const dayName = weekdayLong(day);
  const ws = a4Sheet(wb, `${label ? `${label} ` : ""}${dayName} ${day.slice(8)}.${day.slice(5, 7)}`, 3);
  ws.views = [{ state: "frozen", ySplit: 3 }];

  ws.columns = [{ width: 34 }, { width: 16 }, { width: 14 }, { width: 17 }, { width: 19 }];

  titleRows(
    ws,
    "E",
    `${label ? `${label} — ` : ""}${dayName}, ${longDate(day)} — Sipariş listesi`,
    `${rows.length} müşteri · Toplam hesap: + kalan borç, − alacak · Oluşturulma ${new Date().toLocaleString("tr-TR")}`,
  );
  headerRow(ws.getRow(3), ["Müşteri adı", "Verilen ekmek", "İade ekmek", "Alınan para", "Toplam hesap"]);

  const list: Array<ExportRow | null> = rows.length ? rows : Array.from({ length: BLANK_ROWS_WHEN_EMPTY }, () => null);
  list.forEach((r, i) => {
    const row = ws.addRow(
      r ? [r.name, orBlank(r.delivered), orBlank(r.returned), orBlank(r.collection), r.total] : [null, null, null, null, null],
    );
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (c, col) => bodyCell(c, col, i % 2 === 1, col === 1 || col === 5));
    row.getCell(2).numFmt = FMT.qty;
    row.getCell(3).numFmt = FMT.qty;
    row.getCell(4).numFmt = FMT.money;
    const total = row.getCell(5);
    total.numFmt = r && Math.abs(r.total) < 0.005 ? '0 "₺"' : '+#,##0.00 "₺";-#,##0.00 "₺"';
    if (r && r.total > 0.004) total.font = { name: XL.font, size: 11, bold: true, color: { argb: XL.debt } };
    if (r && r.total < -0.004) total.font = { name: XL.font, size: 11, bold: true, color: { argb: XL.credit } };
  });

  // Toplam satırı: formül + hesaplanmış sonuç (telefon önizlemeleri formül hesaplamaz).
  // Boş şablonda sonuç yazılmaz: elle doldurulunca Excel kendisi hesaplar.
  const first = 4;
  const last = 3 + list.length;
  const add = (f: (r: ExportRow) => number) => (rows.length ? rows.reduce((a, r) => a + f(r), 0) : undefined);
  const sum = ws.addRow([
    "TOPLAM",
    { formula: `SUM(B${first}:B${last})`, result: add((r) => r.delivered) },
    { formula: `SUM(C${first}:C${last})`, result: add((r) => r.returned) },
    { formula: `SUM(D${first}:D${last})`, result: add((r) => r.collection) },
    { formula: `SUM(E${first}:E${last})`, result: add((r) => r.total) },
  ]);
  totalRowStyle(sum);
  sum.getCell(2).numFmt = FMT.qty;
  sum.getCell(3).numFmt = FMT.qty;
  sum.getCell(4).numFmt = FMT.money;
  sum.getCell(5).numFmt = FMT.signed;

  await saveWorkbook(wb, `Ekmekci_Liste_${day}_${dayName}${label ? `_${fileSafe(label)}` : ""}.xlsx`);
}

// --- Şoför hesabı ------------------------------------------------------------

export type DriverReportRow = { name: string; delivered: number; returned: number; net: number; collection: number };
export type DriverReportExpense = { category: string | null; description: string | null; amount: number };

/** Şoförün gün sonu hesabı: dağıttığı, topladığı, harcadığı ve teslim edeceği para. */
export async function downloadDriverReport(
  day: string,
  driverName: string,
  rows: DriverReportRow[],
  expenses: DriverReportExpense[],
  handedOver: number | null,
) {
  const wb = await newWorkbook();
  const dayName = weekdayLong(day);
  const ws = a4Sheet(wb, `${driverName} ${day.slice(8)}.${day.slice(5, 7)}`);
  ws.columns = [{ width: 34 }, { width: 14 }, { width: 12 }, { width: 17 }, { width: 18 }];

  const tot = rows.reduce(
    (a, r) => ({
      delivered: a.delivered + r.delivered,
      returned: a.returned + r.returned,
      net: a.net + r.net,
      collection: a.collection + r.collection,
    }),
    { delivered: 0, returned: 0, net: 0, collection: 0 },
  );
  const spent = expenses.reduce((a, e) => a + e.amount, 0);
  const toHand = tot.collection - spent;

  titleRows(
    ws,
    "E",
    `${driverName} — ${dayName}, ${longDate(day)} · Gün sonu hesabı`,
    `${rows.length} müşteri · Oluşturulma ${new Date().toLocaleString("tr-TR")}`,
  );

  // Müşteriler
  headerRow(ws.getRow(3), ["Müşteri adı", "Verilen", "İade", "Tutar", "Alınan para"]);
  rows.forEach((r, i) => {
    const row = ws.addRow([r.name, orBlank(r.delivered), orBlank(r.returned), r.net || null, orBlank(r.collection)]);
    row.height = 21;
    row.eachCell({ includeEmpty: true }, (c, col) => bodyCell(c, col, i % 2 === 1, col === 1));
    row.getCell(2).numFmt = FMT.qty;
    row.getCell(3).numFmt = FMT.qty;
    row.getCell(4).numFmt = FMT.money;
    row.getCell(5).numFmt = FMT.money;
  });
  const sum = ws.addRow(["TOPLAM", tot.delivered, tot.returned, tot.net, tot.collection]);
  totalRowStyle(sum);
  sum.getCell(2).numFmt = FMT.qty;
  sum.getCell(3).numFmt = FMT.qty;
  sum.getCell(4).numFmt = FMT.money;
  sum.getCell(5).numFmt = FMT.money;

  // Giderler
  ws.addRow([]);
  sectionTitle(ws, "E", "Giderler");
  const gHead = ws.addRow([]);
  headerRow(gHead, ["Açıklama", "", "", "Tür", "Tutar"]);
  ws.mergeCells(`A${gHead.number}:C${gHead.number}`);
  if (expenses.length === 0) {
    const row = ws.addRow(["Gider yok", null, null, null, null]);
    ws.mergeCells(`A${row.number}:C${row.number}`);
    row.eachCell({ includeEmpty: true }, (c, col) => bodyCell(c, col, false));
  }
  expenses.forEach((e, i) => {
    const row = ws.addRow([e.description || e.category || "Gider", null, null, e.category ?? "", e.amount]);
    ws.mergeCells(`A${row.number}:C${row.number}`);
    row.height = 21;
    row.eachCell({ includeEmpty: true }, (c, col) => bodyCell(c, col, i % 2 === 1));
    row.getCell(5).numFmt = FMT.money;
  });

  // Özet
  ws.addRow([]);
  sectionTitle(ws, "E", "Hesap");
  summaryRow(ws, "E", "Dağıtılan ekmek", tot.delivered, '#,##0 "adet"');
  summaryRow(ws, "E", "İade alınan ekmek", tot.returned, '#,##0 "adet"');
  summaryRow(ws, "E", "Satış tutarı", tot.net, FMT.money);
  summaryRow(ws, "E", "Toplanan para", tot.collection, FMT.money);
  summaryRow(ws, "E", "Giderler", -spent, FMT.money);
  summaryRow(ws, "E", "Teslim edilecek para", toHand, FMT.money, { strong: true, color: XL.green });
  summaryRow(ws, "E", "Teslim alınan para", handedOver, FMT.money);
  if (handedOver != null) {
    const diff = handedOver - toHand;
    summaryRow(ws, "E", diff < 0 ? "Eksik" : diff > 0 ? "Fazla" : "Fark", diff, FMT.signed, {
      strong: true,
      color: Math.abs(diff) < 0.005 ? XL.green : diff < 0 ? XL.debt : XL.credit,
    });
  }

  signatureRow(ws, "Teslim eden", "Teslim alan");

  await saveWorkbook(wb, `Ekmekci_Sofor_${fileSafe(driverName)}_${day}_${dayName}.xlsx`);
}
