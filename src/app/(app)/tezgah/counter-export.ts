// Tezgah gün sonu: A4 tek sayfa, imza alanlı Excel çıktısı.

import { FMT, XL, a4Sheet, bodyCell, headerRow, newWorkbook, saveWorkbook, sectionTitle, signatureRow, summaryRow, titleRows } from "@/lib/excel";
import { longDate, weekdayLong } from "@/lib/format";

export type CounterReport = {
  openingCash: number;
  breadsIn: number;
  breadsLeft: number;
  breadPrice: number | null;
  salesIncome: number;
  closingCash: number;
  handedOver: number | null;
  note: string | null;
  expenses: Array<{ category: string | null; description: string | null; amount: number }>;
};

export function counterMath(r: Pick<CounterReport, "openingCash" | "breadsIn" | "breadsLeft" | "breadPrice" | "salesIncome" | "closingCash" | "handedOver"> & { spent: number }) {
  const sold = Math.max(0, r.breadsIn - r.breadsLeft);
  const expected = r.breadPrice ? sold * r.breadPrice : null;
  const cashGap = expected == null || r.breadsIn === 0 ? null : r.salesIncome - expected; // − açık, + fazla
  const toHand = r.openingCash + r.salesIncome - r.spent - r.closingCash;
  const handDiff = r.handedOver == null ? null : r.handedOver - toHand;
  return { sold, expected, cashGap, toHand, handDiff };
}

export async function downloadCounterReport(day: string, r: CounterReport) {
  const wb = await newWorkbook();
  const dayName = weekdayLong(day);
  const ws = a4Sheet(wb, `Tezgah ${day.slice(8)}.${day.slice(5, 7)}`);
  ws.columns = [{ width: 40 }, { width: 14 }, { width: 14 }, { width: 22 }];

  const spent = r.expenses.reduce((a, e) => a + e.amount, 0);
  const m = counterMath({ ...r, spent });

  titleRows(ws, "D", `Tezgah — ${dayName}, ${longDate(day)} · Gün sonu`, `Oluşturulma ${new Date().toLocaleString("tr-TR")}`);

  sectionTitle(ws, "D", "Sabah");
  summaryRow(ws, "D", "Kasadaki para (açılış)", r.openingCash, FMT.money);
  summaryRow(ws, "D", "Tezgaha konan ekmek", r.breadsIn, '#,##0 "adet"');
  summaryRow(ws, "D", "Ekmek fiyatı", r.breadPrice, FMT.money);

  ws.addRow([]);
  sectionTitle(ws, "D", "Akşam");
  summaryRow(ws, "D", "Kalan ekmek", r.breadsLeft, '#,##0 "adet"');
  summaryRow(ws, "D", "Satılan ekmek", m.sold, '#,##0 "adet"');
  summaryRow(ws, "D", "Gün içi gelen para", r.salesIncome, FMT.money);
  summaryRow(ws, "D", "Kasada bırakılan para", r.closingCash, FMT.money);

  ws.addRow([]);
  sectionTitle(ws, "D", "Giderler");
  const gHead = ws.addRow([]);
  headerRow(gHead, ["Açıklama", "", "Tür", "Tutar"]);
  ws.mergeCells(`A${gHead.number}:B${gHead.number}`);
  if (r.expenses.length === 0) {
    const row = ws.addRow(["Gider yok", null, null, null]);
    ws.mergeCells(`A${row.number}:B${row.number}`);
    row.eachCell({ includeEmpty: true }, (c, col) => bodyCell(c, col, false));
  }
  r.expenses.forEach((e, i) => {
    const row = ws.addRow([e.description || e.category || "Gider", null, e.category ?? "", e.amount]);
    ws.mergeCells(`A${row.number}:B${row.number}`);
    row.height = 21;
    row.eachCell({ includeEmpty: true }, (c, col) => bodyCell(c, col, i % 2 === 1));
    row.getCell(4).numFmt = FMT.money;
  });
  summaryRow(ws, "D", "Toplam gider", spent, FMT.money, { color: XL.debt });

  ws.addRow([]);
  sectionTitle(ws, "D", "Hesap");
  if (m.expected != null) summaryRow(ws, "D", `Beklenen satış (${m.sold} × fiyat)`, m.expected, FMT.money);
  if (m.cashGap != null) {
    summaryRow(ws, "D", m.cashGap < 0 ? "Kasa açığı" : m.cashGap > 0 ? "Kasa fazlası" : "Kasa farkı", m.cashGap, FMT.signed, {
      color: Math.abs(m.cashGap) < 0.005 ? XL.green : m.cashGap < 0 ? XL.debt : XL.credit,
    });
  }
  summaryRow(ws, "D", "Teslim edilecek para", m.toHand, FMT.money, { strong: true, color: XL.green });
  summaryRow(ws, "D", "Teslim alınan para", r.handedOver, FMT.money);
  if (m.handDiff != null) {
    summaryRow(ws, "D", m.handDiff < 0 ? "Eksik" : m.handDiff > 0 ? "Fazla" : "Fark", m.handDiff, FMT.signed, {
      strong: true,
      color: Math.abs(m.handDiff) < 0.005 ? XL.green : m.handDiff < 0 ? XL.debt : XL.credit,
    });
  }

  if (r.note) {
    ws.addRow([]);
    const row = ws.addRow([`Not: ${r.note}`]);
    ws.mergeCells(`A${row.number}:D${row.number}`);
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).font = { name: XL.font, size: 11, color: { argb: XL.muted } };
    row.height = 36;
  }

  signatureRow(ws, "Teslim eden", "Teslim alan");

  await saveWorkbook(wb, `Ekmekci_Tezgah_${day}_${dayName}.xlsx`);
}
