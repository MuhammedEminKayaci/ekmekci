// Günün sipariş listesini biçimli bir Excel dosyası olarak indirir.
// exceljs yalnızca butona basıldığında yüklenir.

import { longDate, weekdayLong } from "@/lib/format";

export type ExportRow = {
  name: string;
  delivered: number;
  returned: number;
  collection: number;
  total: number; // + borç, − alacak
};

const GREEN = "FF0A6E3B";
const GREEN_SOFT = "FFE6F2EA";
const LINE = "FFB9CDBF";
const DEBT = "FFC9283F";
const CREDIT = "FF0A7A42";
const BLANK_ROWS_WHEN_EMPTY = 20;

/** Değer yoksa boş hücre: liste elle doldurulabilsin. */
const orBlank = (v: number) => (v ? v : null);

export async function downloadDayList(day: string, rows: ExportRow[]) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ekmekçi";
  wb.created = new Date();

  const dayName = weekdayLong(day);
  const ws = wb.addWorksheet(`${dayName} ${day.slice(8)}.${day.slice(5, 7)}`, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: "3:3",
    },
    headerFooter: { oddFooter: "&LEkmekçi&RSayfa &P / &N" },
    views: [{ state: "frozen", ySplit: 3 }],
  });

  ws.columns = [
    { key: "name", width: 34 },
    { key: "delivered", width: 16 },
    { key: "returned", width: 14 },
    { key: "collection", width: 17 },
    { key: "total", width: 19 },
  ];

  const border = {
    top: { style: "thin" as const, color: { argb: LINE } },
    left: { style: "thin" as const, color: { argb: LINE } },
    bottom: { style: "thin" as const, color: { argb: LINE } },
    right: { style: "thin" as const, color: { argb: LINE } },
  };
  const money = '#,##0.00 "₺";[Red]-#,##0.00 "₺"';

  // 1: başlık
  ws.mergeCells("A1:E1");
  const title = ws.getCell("A1");
  title.value = `${dayName}, ${longDate(day)} — Sipariş listesi`;
  title.font = { name: "Arial", size: 16, bold: true, color: { argb: GREEN } };
  title.alignment = { vertical: "middle" };
  ws.getRow(1).height = 28;

  // 2: alt bilgi
  ws.mergeCells("A2:E2");
  const sub = ws.getCell("A2");
  sub.value = `${rows.length} müşteri · Toplam hesap: + kalan borç, − alacak · Oluşturulma ${new Date().toLocaleString("tr-TR")}`;
  sub.font = { name: "Arial", size: 10, color: { argb: "FF5A6B60" } };
  ws.getRow(2).height = 18;

  // 3: sütun başlıkları
  const head = ws.getRow(3);
  head.values = ["Müşteri adı", "Verilen ekmek", "İade ekmek", "Alınan para", "Toplam hesap"];
  head.height = 24;
  head.eachCell((c, col) => {
    c.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    c.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
    c.border = border;
  });

  // Veri satırları (günün sırasıyla)
  const list: Array<ExportRow | null> = rows.length ? rows : Array.from({ length: BLANK_ROWS_WHEN_EMPTY }, () => null);
  list.forEach((r, i) => {
    const row = ws.addRow(
      r
        ? [r.name, orBlank(r.delivered), orBlank(r.returned), orBlank(r.collection), r.total]
        : [null, null, null, null, null],
    );
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = border;
      c.font = { name: "Arial", size: 11, bold: col === 1 || col === 5 };
      c.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
      if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6FAF7" } };
    });
    row.getCell(2).numFmt = "#,##0";
    row.getCell(3).numFmt = "#,##0";
    row.getCell(4).numFmt = money;
    const total = row.getCell(5);
    total.numFmt = r && Math.abs(r.total) < 0.005 ? '0 "₺"' : '+#,##0.00 "₺";-#,##0.00 "₺"';
    if (r && r.total > 0.004) total.font = { name: "Arial", size: 11, bold: true, color: { argb: DEBT } };
    if (r && r.total < -0.004) total.font = { name: "Arial", size: 11, bold: true, color: { argb: CREDIT } };
  });

  // Toplam satırı: boş günde de formülle elle girilenleri toplar.
  const first = 4;
  const last = 3 + list.length;
  // Hesaplanmış sonuç da yazılır: telefon önizlemeleri formül hesaplamaz.
  // Boş şablonda sonuç yazılmaz: elle doldurulunca Excel kendisi hesaplar.
  const add = (f: (r: ExportRow) => number) => (rows.length ? rows.reduce((a, r) => a + f(r), 0) : undefined);
  const sum = ws.addRow([
    "TOPLAM",
    { formula: `SUM(B${first}:B${last})`, result: add((r) => r.delivered) },
    { formula: `SUM(C${first}:C${last})`, result: add((r) => r.returned) },
    { formula: `SUM(D${first}:D${last})`, result: add((r) => r.collection) },
    { formula: `SUM(E${first}:E${last})`, result: add((r) => r.total) },
  ]);
  sum.height = 24;
  sum.eachCell((c, col) => {
    c.font = { name: "Arial", size: 11, bold: true, color: { argb: GREEN } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_SOFT } };
    c.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
    c.border = { ...border, top: { style: "medium", color: { argb: GREEN } } };
  });
  sum.getCell(2).numFmt = "#,##0";
  sum.getCell(3).numFmt = "#,##0";
  sum.getCell(4).numFmt = money;
  sum.getCell(5).numFmt = '+#,##0.00 "₺";-#,##0.00 "₺";0 "₺"';

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Ekmekci_Liste_${day}_${dayName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
