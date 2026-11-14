// Tezgah gün sonu: A4 tek sayfa, imza alanlı Excel çıktısı.

import { FMT, XL, a4Sheet, bodyCell, headerRow, newWorkbook, saveWorkbook, sectionTitle, signatureRow, summaryRow, titleRows } from "@/lib/excel";
import { longDate, weekdayLong } from "@/lib/format";

export type CounterReport = {
  bread: number;
  sales: Array<{ name: string; qty: number; unit_price: number; amount: number }>;
};

export async function downloadCounterReport(day: string, r: CounterReport) {
  const wb = await newWorkbook();
  const dayName = weekdayLong(day);
  const ws = a4Sheet(wb, `Tezgah ${day.slice(8)}.${day.slice(5, 7)}`);
  ws.columns = [{ width: 40 }, { width: 12 }, { width: 16 }, { width: 18 }];

  const items = r.sales.reduce((a, s) => a + s.amount, 0);

  titleRows(ws, "D", `Tezgah — ${dayName}, ${longDate(day)}`, `Oluşturulma ${new Date().toLocaleString("tr-TR")}`);

  sectionTitle(ws, "D", "Ekmek");
  summaryRow(ws, "D", "Tezgahtan gelen ekmek parası", r.bread, FMT.money);

  ws.addRow([]);
  sectionTitle(ws, "D", "Ek ürünler");
  headerRow(ws.addRow([]), ["Ürün", "Adet", "Tanesi", "Tutar"]);
  if (r.sales.length === 0) {
    const row = ws.addRow(["Ek ürün satılmadı", null, null, null]);
    row.eachCell({ includeEmpty: true }, (c, col) => bodyCell(c, col, false));
  }
  r.sales.forEach((s, i) => {
    const row = ws.addRow([s.name, s.qty, s.unit_price, s.amount]);
    row.height = 21;
    row.eachCell({ includeEmpty: true }, (c, col) => bodyCell(c, col, i % 2 === 1));
    row.getCell(2).numFmt = "#,##0.##";
    row.getCell(3).numFmt = FMT.money;
    row.getCell(4).numFmt = FMT.money;
  });
  summaryRow(ws, "D", "Ek ürünler toplamı", items, FMT.money);

  ws.addRow([]);
  summaryRow(ws, "D", "Tezgah toplamı", r.bread + items, FMT.money, { strong: true, color: XL.green });

  signatureRow(ws, "Teslim eden", "Teslim alan");

  await saveWorkbook(wb, `Ekmekci_Tezgah_${day}_${dayName}.xlsx`);
}
