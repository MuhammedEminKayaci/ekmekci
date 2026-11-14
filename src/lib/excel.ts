// Excel çıktıları için ortak görünüm ve indirme yardımcıları.
// exceljs yalnızca bir çıktı istendiğinde yüklenir.

import type { Borders, Cell, Row, Workbook, Worksheet } from "exceljs";

export const XL = {
  green: "FF0A6E3B",
  greenSoft: "FFE6F2EA",
  zebra: "FFF6FAF7",
  line: "FFB9CDBF",
  debt: "FFC9283F",
  credit: "FF0A7A42",
  muted: "FF5A6B60",
  font: "Arial",
};

export const FMT = {
  qty: "#,##0",
  money: '#,##0.00 "₺";[Red]-#,##0.00 "₺"',
  signed: '+#,##0.00 "₺";-#,##0.00 "₺";0 "₺"',
};

export const border: Partial<Borders> = {
  top: { style: "thin", color: { argb: XL.line } },
  left: { style: "thin", color: { argb: XL.line } },
  bottom: { style: "thin", color: { argb: XL.line } },
  right: { style: "thin", color: { argb: XL.line } },
};

export async function newWorkbook(): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ekmekçi";
  wb.created = new Date();
  return wb;
}

/** A4 dikey, tek sayfa genişliğinde yazdırılan sayfa. */
export function a4Sheet(wb: Workbook, name: string, repeatRow?: number): Worksheet {
  return wb.addWorksheet(name.slice(0, 31), {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      ...(repeatRow ? { printTitlesRow: `${repeatRow}:${repeatRow}` } : {}),
    },
    headerFooter: { oddFooter: "&LEkmekçi · www.kayacimedia.com&RSayfa &P / &N" },
  });
}

export function titleRows(ws: Worksheet, lastCol: string, title: string, subtitle: string) {
  ws.mergeCells(`A1:${lastCol}1`);
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { name: XL.font, size: 16, bold: true, color: { argb: XL.green } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${lastCol}2`);
  const s = ws.getCell("A2");
  s.value = subtitle;
  s.font = { name: XL.font, size: 10, color: { argb: XL.muted } };
  ws.getRow(2).height = 18;
}

export function headerRow(row: Row, values: string[]) {
  row.values = values;
  row.height = 24;
  row.eachCell((c, col) => {
    c.font = { name: XL.font, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.green } };
    c.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
    c.border = border;
  });
}

export function bodyCell(c: Cell, col: number, zebra: boolean, bold = false) {
  c.border = border;
  c.font = { name: XL.font, size: 11, bold };
  c.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
  if (zebra) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.zebra } };
}

export function totalRowStyle(row: Row) {
  row.height = 24;
  row.eachCell({ includeEmpty: true }, (c, col) => {
    c.font = { name: XL.font, size: 11, bold: true, color: { argb: XL.green } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.greenSoft } };
    c.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
    c.border = { ...border, top: { style: "medium", color: { argb: XL.green } } };
  });
}

export function sectionTitle(ws: Worksheet, lastCol: string, text: string) {
  const row = ws.addRow([text]);
  ws.mergeCells(`A${row.number}:${lastCol}${row.number}`);
  row.height = 22;
  const c = row.getCell(1);
  c.font = { name: XL.font, size: 12, bold: true, color: { argb: XL.green } };
  c.alignment = { vertical: "bottom" };
  return row;
}

/** Etiket solda, değer en sağ sütunda olan özet satırı. */
export function summaryRow(
  ws: Worksheet,
  lastCol: string,
  label: string,
  value: number | null,
  fmt: string,
  opts: { strong?: boolean; color?: string } = {},
) {
  const width = lastCol.charCodeAt(0) - 64;
  const values: Array<string | number | null> = [label, ...Array(width - 2).fill(null), value];
  const row = ws.addRow(values);
  ws.mergeCells(`A${row.number}:${String.fromCharCode(63 + width)}${row.number}`);
  row.height = opts.strong ? 24 : 21;
  row.eachCell({ includeEmpty: true }, (c, col) => {
    c.border = border;
    c.font = { name: XL.font, size: opts.strong ? 12 : 11, bold: opts.strong || col === width, color: opts.color ? { argb: opts.color } : undefined };
    c.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
    if (opts.strong) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.greenSoft } };
  });
  row.getCell(width).numFmt = fmt;
  return row;
}

export function signatureRow(ws: Worksheet, left: string, right: string) {
  ws.addRow([]);
  ws.addRow([]);
  const row = ws.addRow([`${left}: ______________________`, null, null, `${right}: ______________________`]);
  row.height = 26;
  row.eachCell((c) => {
    c.font = { name: XL.font, size: 11, color: { argb: XL.muted } };
  });
}

/** Dosya adında sorun çıkarabilecek karakterleri temizler. */
export function fileSafe(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");
}

export async function saveWorkbook(wb: Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
