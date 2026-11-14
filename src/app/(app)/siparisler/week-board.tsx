"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  CopyPlus,
  FileSpreadsheet,
  HandCoins,
  Loader2,
  Lock,
  Plus,
  Receipt,
  Scale,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { Balance, BalanceBadge, Button, Empty, IconChip, cx, inputClass, order } from "@/components/ui";
import { AllView } from "./all-view";
import { DayOrder } from "./day-order";
import { DriverDay, type DayExpense } from "./driver-day";
import { DriversManage } from "./drivers-manage";
import { downloadDayList } from "./day-export";
import { addCustomersToDay, addLine, copyDayFromLastWeek, deleteLine, deleteOrder, saveCollection, saveLine, type OrderTotals } from "@/lib/actions";
import { balanceTone, longDate, money, parseAmount, qty, weekdayLong, weekdayShort } from "@/lib/format";

export type BoardRow = {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_type: number;
  driver_id: number;
  entry_date: string;
  sort_order: number;
  collection: number;
  is_locked: boolean;
  lines: BoardLine[];
};

export type BoardLine = {
  id: number;
  product_id: number;
  product_name: string;
  product_unit: string;
  delivered_qty: number;
  returned_qty: number;
  unit_price: number;
};

export type CustomerProduct = { product_id: number; name: string; unit: string; price: number | null };
export type BoardCustomer = { id: number; name: string; type: number; products: CustomerProduct[] };
export type BoardDriver = { id: number; name: string; is_owner: boolean; is_active: boolean };
type DriverDayRow = { entry_date: string; driver_id: number; handed_over: number | null };

const lineNet = (l: BoardLine) => (l.delivered_qty - l.returned_qty) * l.unit_price;
const net = (r: BoardRow) => r.lines.reduce((a, l) => a + lineNet(l), 0);
const delivered = (r: BoardRow) => r.lines.reduce((a, l) => a + l.delivered_qty, 0);
const returned = (r: BoardRow) => r.lines.reduce((a, l) => a + l.returned_qty, 0);
const delta = (r: BoardRow) => net(r) - r.collection;

/** Özet bileşenleri (Hepsi, gün sonu) için satırın toplamları. */
const summary = (r: BoardRow) => ({ ...r, delivered_qty: delivered(r), returned_qty: returned(r), net: net(r) });

function sum(rows: BoardRow[], f: (r: BoardRow) => number) {
  return rows.reduce((acc, r) => acc + f(r), 0);
}

const GRID =
  "xl:grid xl:grid-cols-[minmax(8rem,1fr)_minmax(19rem,2.6fr)_minmax(7rem,0.9fr)_minmax(5.5rem,0.7fr)_minmax(7rem,0.9fr)_minmax(7.5rem,0.9fr)_5.25rem] xl:items-start xl:gap-3 2xl:gap-4";

/** Ürün satırının iç ızgarası (başlık ve satır aynı). */
const LINE_GRID = "xl:grid-cols-[minmax(6.5rem,1.4fr)_repeat(2,minmax(5rem,1fr))_minmax(4.5rem,0.8fr)]";

export function WeekBoard({
  weekStart,
  days,
  today,
  initialDay,
  locked,
  rows: serverRows,
  customers,
  balances,
  isAdmin,
  drivers,
  expenses,
  driverDays,
}: {
  weekStart: string;
  days: string[];
  today: string;
  initialDay: string;
  locked: boolean;
  rows: BoardRow[];
  customers: BoardCustomer[];
  balances: Record<number, number>;
  isAdmin: boolean;
  drivers: BoardDriver[];
  expenses: DayExpense[];
  driverDays: DriverDayRow[];
}) {
  const [day, setDay] = useState(initialDay);
  const owner = drivers.find((d) => d.is_owner);
  const [tab, setTab] = useState<number | "all">(owner?.id ?? "all");
  const [managing, setManaging] = useState(false);
  const [rows, setRows] = useState(serverRows);
  const [adding, setAdding] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [copying, startCopy] = useTransition();
  const [exporting, startExport] = useTransition();

  // Ekle/sil sonrası sunucudan gelen güncel liste.
  const [lastServerRows, setLastServerRows] = useState(serverRows);
  if (serverRows !== lastServerRows) {
    setLastServerRows(serverRows);
    setRows(serverRows);
  }

  const byDay = useMemo(() => {
    const map = new Map<string, BoardRow[]>(days.map((d) => [d, []]));
    for (const r of rows) map.get(r.entry_date)?.push(r);
    return map;
  }, [rows, days]);

  const allDayRows = byDay.get(day) ?? [];
  const dayRows = tab === "all" ? allDayRows : allDayRows.filter((r) => r.driver_id === tab);
  const activeDriver = tab === "all" ? null : (drivers.find((d) => d.id === tab) ?? null);
  const dayExpenses = expenses.filter((e) => e.entry_date === day);

  // Sekmeler: aktif dağıtıcılar + o gün kaydı olan pasifler.
  const tabDrivers = drivers.filter((d) => d.is_active || allDayRows.some((r) => r.driver_id === d.id));

  // Toplam hesap = sunucudaki bakiye + bu haftada yazılan ama henüz yenilenmemiş değişiklikler.
  const totals = useMemo(() => {
    const diff = new Map<number, number>();
    const original = new Map(serverRows.map((r) => [r.id, delta(r)]));
    for (const r of rows) {
      diff.set(r.customer_id, (diff.get(r.customer_id) ?? 0) + delta(r) - (original.get(r.id) ?? 0));
    }
    return (customerId: number) => (balances[customerId] ?? 0) + (diff.get(customerId) ?? 0);
  }, [rows, serverRows, balances]);

  function selectTab(t: number | "all") {
    setTab(t);
    setOrdering(false);
  }

  function selectDay(d: string) {
    setDay(d);
    setOrdering(false);
    window.history.replaceState(null, "", `/siparisler?hafta=${weekStart}&gun=${d}`);
  }

  function patchRow(id: number, patch: Partial<BoardRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function patchLine(orderId: number, lineId: number, patch: Partial<BoardLine>) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === orderId ? { ...r, lines: r.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) } : r,
      ),
    );
  }

  const customerProducts = useMemo(() => new Map(customers.map((c) => [c.id, c.products])), [customers]);

  function exportList() {
    startExport(async () => {
      try {
        const list = new Map<number, { name: string; delivered: number; returned: number; collection: number }>();
        for (const r of dayRows) {
          const c = list.get(r.customer_id) ?? { name: r.customer_name, delivered: 0, returned: 0, collection: 0 };
          c.delivered += delivered(r);
          c.returned += returned(r);
          c.collection += r.collection;
          list.set(r.customer_id, c);
        }
        await downloadDayList(
          day,
          [...list.entries()].map(([id, c]) => ({ ...c, total: totals(id) })),
          activeDriver ? activeDriver.name : undefined,
        );
        toast(`${weekdayLong(day)} listesi indirildi.`);
      } catch {
        toast("Liste oluşturulamadı. Tekrar deneyin.", "error");
      }
    });
  }

  function copyLastWeek() {
    startCopy(async () => {
      const res = await copyDayFromLastWeek(day, tab === "all" ? undefined : tab);
      if (res.ok) toast(`Geçen ${weekdayLong(day).toLocaleLowerCase("tr")} listesindeki ${res.data} müşteri eklendi.`);
      else toast(res.error, "error");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Gün şeridi */}
      <div className="grid grid-cols-7 gap-1.5 xs:gap-2 sm:gap-3" role="tablist" aria-label="Haftanın günleri">
        {days.map((d, i) => {
          const list = byDay.get(d) ?? [];
          const active = d === day;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectDay(d)}
              style={order(i)}
              className={cx(
                "animate-rise relative flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-1 py-2.5 transition-all duration-300 ease-out sm:items-start sm:px-4 sm:py-3.5",
                active ? "brand-fill -translate-y-0.5" : "neu-sm hover:-translate-y-0.5",
              )}
            >
              <span className={cx("text-[0.72rem] font-semibold sm:text-[0.8rem]", active ? "text-white/85" : "text-ink-2")}>
                {weekdayShort(d)}
              </span>
              <span className={cx("font-display tnum text-[1.3rem] leading-none font-semibold sm:text-[1.6rem]", !active && "text-ink")}>
                {Number(d.slice(8))}
              </span>
              <span className={cx("tnum mt-1.5 hidden text-[0.75rem] sm:block", active ? "text-white/80" : "text-ink-3")}>
                {list.length ? `${new Set(list.map((r) => r.customer_id)).size} müşteri` : "Kayıt yok"}
              </span>
              <span className={cx("tnum hidden max-w-full truncate text-[0.85rem] font-semibold sm:block", active ? "text-white" : "text-ink-2")}>
                {list.length ? money(sum(list, net)) : "—"}
              </span>
              {isToday && (
                <span
                  className={cx(
                    "mt-1 rounded-full px-1.5 text-[0.6rem] font-bold sm:absolute sm:top-3 sm:right-3 sm:mt-0 sm:px-2 sm:text-[0.66rem]",
                    active ? "bg-white/20 text-white" : "bg-brand-soft text-brand-deep dark:text-brand",
                  )}
                >
                  Bugün
                </span>
              )}
              {!isToday && list.length > 0 && (
                <span className={cx("mt-1 size-1.5 rounded-full sm:hidden", active ? "bg-white/70" : "bg-brand")} aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* Gün paneli */}
      <section key={day} className="neu animate-rise rounded-tile">
        <div className="flex flex-col gap-4 p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-[1.45rem] font-semibold tracking-tight">
              {weekdayLong(day)}
              <span className="ml-2 font-sans text-[0.95rem] font-medium text-ink-3">{longDate(day)}</span>
            </h2>
            {ordering ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-[0.88rem] font-semibold text-brand-deep dark:text-brand">
                <ArrowUpDown size={15} /> Müşteri sırasını düzenliyorsunuz.
              </p>
            ) : locked ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-[0.88rem] text-ink-2">
                <Lock size={14} /> Geçmiş hafta. Kayıtlar sadece görüntülenir, değiştirilemez.
              </p>
            ) : (
              dayRows.length > 0 && (
                <p className="mt-1 text-[0.88rem] text-ink-2 xl:hidden">Sayıları yazmanız yeterli, her şey otomatik kaydedilir.</p>
              )
            )}
            {!locked && !ordering && dayRows.length > 0 && (
              <p className="mt-1 hidden text-[0.88rem] text-ink-2 xl:block">
                Kutucuğa yazın, <kbd className="rounded-md bg-bg-deep px-1.5 py-0.5 text-[0.78rem] font-semibold">Enter</kbd> ile
                sonrakine geçin. Her şey otomatik kaydedilir.
              </p>
            )}
          </div>
          {!ordering && (
            <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:justify-end">
              <Button onClick={exportList} disabled={exporting}>
                <FileSpreadsheet size={18} className="text-brand-deep dark:text-brand" />
                {exporting ? "Hazırlanıyor…" : "Liste çıkar"}
              </Button>
              {!locked && activeDriver && dayRows.length > 1 && (
                <Button onClick={() => setOrdering(true)}>
                  <ArrowUpDown size={18} /> Sırayı düzenle
                </Button>
              )}
              {!locked && activeDriver && (
                <>
                  <Button onClick={copyLastWeek} disabled={copying}>
                    <CopyPlus size={18} />
                    {copying ? "Getiriliyor…" : "Geçen haftayı getir"}
                  </Button>
                  <Button variant="primary" onClick={() => setAdding(true)}>
                    <Plus size={19} /> Müşteri ekle
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Dağıtıcı sekmeleri */}
        <div className="flex items-center gap-2 overflow-x-auto px-5 pb-4 sm:px-6" role="tablist" aria-label="Dağıtıcılar">
          {[{ id: "all" as const, label: "Hepsi" }, ...tabDrivers.map((d) => ({ id: d.id, label: d.name }))].map(
            (t) => {
              const count =
                t.id === "all"
                  ? new Set(allDayRows.map((r) => r.customer_id)).size
                  : allDayRows.filter((r) => r.driver_id === t.id).length;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectTab(t.id)}
                  className={cx(
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[0.9rem] font-semibold transition-all duration-300",
                    active ? "brand-fill" : "neu-sm text-ink-2 hover:text-ink",
                  )}
                >
                  {t.label}
                  <span
                    className={cx(
                      "tnum min-w-6 rounded-full px-1.5 text-[0.75rem]",
                      active ? "bg-white/20" : "bg-bg-deep text-ink-3",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            },
          )}
          {isAdmin && (
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.85rem] font-semibold text-ink-2 hover:bg-brand-soft hover:text-ink"
          >
            <Settings2 size={16} /> Dağıtıcılar
          </button>
          )}
        </div>

        {tab === "all" && !ordering ? (
          <AllView
            rows={allDayRows.map(summary)}
            drivers={drivers}
            expenses={dayExpenses}
            total={totals}
            onPickDriver={(id) => selectTab(id)}
          />
        ) : ordering ? (
          <DayOrder
            day={day}
            items={dayRows.map((r) => ({ id: r.id, name: r.customer_name }))}
            onClose={() => setOrdering(false)}
          />
        ) : dayRows.length === 0 ? (
          locked ? (
            <Empty title="Bu gün için kayıt yok" />
          ) : (
            <div className="animate-fade px-5 pb-8 sm:px-6">
              <ol className="grid gap-3 md:grid-cols-3">
                {[
                  { title: "Müşteri ekleyin", text: "“Müşteri ekle” ile bu gün ekmek verdiğiniz müşterileri seçin." },
                  { title: "Sayıları yazın", text: "Her müşteri için verilen ekmek, iade ve alınan parayı yazın." },
                  { title: "Gerisi otomatik", text: "Tutar, borç ve alacak müşterinin fiyatıyla anında hesaplanır." },
                ].map((s, i) => (
                  <li key={s.title} className="neu-inset rounded-2xl p-4">
                    <span className="brand-fill mb-3 grid size-8 place-items-center rounded-full text-[0.9rem] font-bold">
                      {i + 1}
                    </span>
                    <p className="font-semibold">{s.title}</p>
                    <p className="mt-0.5 text-[0.88rem] text-ink-2">{s.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          )
        ) : (
          <>
            <div className={cx("hidden border-y border-line px-6 py-3 text-[0.8rem] font-semibold text-ink-3", GRID)}>
              <span>Müşteri</span>
              <span className={cx("grid gap-2", LINE_GRID)}>
                <span>Ürün</span>
                <span>Verilen</span>
                <span>İade</span>
                <span className="text-right">Tutar</span>
              </span>
              <span>Alınan para</span>
              <span className="text-right">Toplam tutar</span>
              <span className="text-right">Bugünkü sonuç</span>
              <span className="text-right">Toplam hesap</span>
              <span />
            </div>
            <ul className="flex flex-col gap-3 px-3 pb-3 sm:px-4 xl:gap-0 xl:px-0 xl:pb-0">
              {dayRows.map((r, i) => (
                <OrderRow
                  key={r.id}
                  index={i}
                  row={r}
                  total={totals(r.customer_id)}
                  products={customerProducts.get(r.customer_id) ?? []}
                  readOnly={locked || r.is_locked}
                  onDraft={(p) => patchRow(r.id, p)}
                  onLine={(lineId, p) => patchLine(r.id, lineId, p)}
                />
              ))}
            </ul>
            <DayTotals rows={dayRows} />
          </>
        )}

        {activeDriver && !ordering && (dayRows.length > 0 || dayExpenses.some((e) => e.driver_id === activeDriver.id)) && (
          <DriverDay
            key={`${day}-${activeDriver.id}`}
            day={day}
            driver={activeDriver}
            rows={dayRows.map(summary)}
            expenses={dayExpenses.filter((e) => e.driver_id === activeDriver.id)}
            handedOver={driverDays.find((d) => d.entry_date === day && d.driver_id === activeDriver.id)?.handed_over ?? null}
            locked={locked}
          />
        )}
      </section>

      <Sheet open={managing} onClose={() => setManaging(false)} title="Dağıtıcılar">
        <DriversManage drivers={drivers} />
      </Sheet>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={`${weekdayLong(day)} · ${activeDriver ? `${activeDriver.name} listesi` : ""}`}
      >
        <AddCustomersForm
          day={day}
          driverId={activeDriver?.id}
          customers={customers}
          taken={new Set(dayRows.map((r) => r.customer_id))}
          onClose={() => setAdding(false)}
        />
      </Sheet>
    </div>
  );
}

// --- Satır -------------------------------------------------------------------

function focusNext(current: HTMLInputElement) {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-entry]:not([readonly])"));
  const i = all.indexOf(current);
  if (i >= 0 && all[i + 1]) all[i + 1].focus();
  else current.blur();
}

function NumberBox({
  label,
  unit,
  decimal = false,
  value,
  readOnly,
  onChange,
  onCommit,
  ariaLabel,
}: {
  label: string;
  unit: string;
  decimal?: boolean;
  value: string;
  readOnly: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
  ariaLabel: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 xl:block">
      <span className="text-[0.74rem] font-semibold text-ink-2 xl:sr-only">{label}</span>
      <span className="relative block">
        <input
          value={value}
          readOnly={readOnly}
          data-entry
          inputMode={decimal ? "decimal" : "numeric"}
          enterKeyHint="next"
          placeholder="0"
          autoComplete="off"
          aria-label={ariaLabel}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, ""))}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusNext(e.currentTarget);
            }
          }}
          className={cx(
            inputClass,
            "min-h-11 py-1.5 pr-3 pl-10 text-right text-[1.02rem] font-semibold",
            readOnly && "bg-transparent shadow-none",
          )}
        />
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.72rem] font-semibold text-ink-3">
          {unit}
        </span>
      </span>
    </label>
  );
}

function OrderRow({
  row,
  index,
  total,
  products,
  readOnly,
  onDraft,
  onLine,
}: {
  row: BoardRow;
  index: number;
  total: number;
  products: CustomerProduct[];
  readOnly: boolean;
  onDraft: (patch: Partial<BoardRow>) => void;
  onLine: (lineId: number, patch: Partial<BoardLine>) => void;
}) {
  const [collectionText, setCollectionText] = useState(
    row.collection ? (Number.isInteger(row.collection) ? String(row.collection) : row.collection.toFixed(2).replace(".", ",")) : "",
  );
  const [savedCollection, setSavedCollection] = useState(row.collection);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [addingLine, startAddLine] = useTransition();

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3500);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  useEffect(() => {
    if (state !== "saved") return;
    const t = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(t);
  }, [state]);

  async function commitCollection() {
    if (row.collection === savedCollection) return;
    setState("saving");
    const res = await saveCollection(row.id, row.collection);
    if (res.ok && res.data) {
      setSavedCollection(res.data.collection);
      setState("saved");
    } else if (!res.ok) {
      setState("idle");
      toast(`${row.customer_name}: ${res.error}`, "error");
    }
  }

  const rowNet = net(row);
  const rowDelta = delta(row);
  const tone = balanceTone(rowDelta);
  const missing = products.filter((p) => !row.lines.some((l) => l.product_id === p.product_id));

  function addProduct(productId: number) {
    startAddLine(async () => {
      const res = await addLine(row.id, productId);
      if (!res.ok) toast(res.error, "error");
    });
  }

  return (
    <li
      style={order(index)}
      className="neu-sm animate-rise rounded-2xl p-4 xl:rounded-none xl:border-b xl:border-line xl:bg-transparent xl:px-6 xl:py-2.5 xl:shadow-none xl:transition-colors xl:hover:bg-brand-soft/30"
    >
      <div className={cx("flex flex-col gap-3 xl:gap-y-0", GRID)}>
        {/* Müşteri */}
        <div className="flex items-center justify-between gap-2 xl:min-h-11">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              href={`/musteriler/${row.customer_id}`}
              className="truncate text-[1.02rem] font-semibold text-ink hover:text-brand-deep dark:hover:text-brand"
            >
              {row.customer_name}
            </Link>
            {state === "saving" && <Loader2 size={14} className="shrink-0 animate-spin text-ink-3" aria-label="Kaydediliyor" />}
            {state === "saved" && (
              <Check size={15} strokeWidth={3} className="animate-pop shrink-0 text-brand-deep dark:text-brand" aria-label="Kaydedildi" />
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1.5 xl:hidden">
            <BalanceBadge value={rowDelta} kind="delta" />
            {!readOnly && <AddLineMenu products={missing} disabled={addingLine} onPick={addProduct} />}
          </span>
        </div>

        {/* Ürün satırları */}
        <div className="flex flex-col gap-2 xl:gap-1.5">
          {row.lines.length === 0 && (
            <p className="flex min-h-11 items-center rounded-xl bg-bg-deep/60 px-3 text-[0.85rem] text-ink-2">
              {readOnly || missing.length === 0 ? "Ürün yok — sadece para alındı." : "Ürün yok — sağdaki + ile ekleyin ya da sadece parayı yazın."}
            </p>
          )}
          {row.lines.map((l) => (
            <LineRow
              key={l.id}
              line={l}
              customerName={row.customer_name}
              readOnly={readOnly}
              removable={row.lines.length > 1}
              onDraft={(p) => onLine(l.id, p)}
              onSaved={(o) => onDraft({ collection: o.collection })}
              onError={() => setState("idle")}
            />
          ))}
        </div>

        {/* Alınan para */}
        <div>
          <NumberBox
            label="Alınan para"
            unit="₺"
            decimal
            value={collectionText}
            readOnly={readOnly}
            onChange={(v) => {
              setCollectionText(v);
              onDraft({ collection: Math.max(0, parseAmount(v) ?? 0) });
            }}
            onCommit={commitCollection}
            ariaLabel={`${row.customer_name} tahsilat`}
          />
        </div>

        {/* Mobil: sonuç */}
        <div className="flex flex-wrap items-center gap-2 xl:contents">
          <p className="tnum flex-1 rounded-xl bg-bg-deep/70 px-3 py-2 text-[0.85rem] text-ink-2 xl:hidden">
            Tutar <b className="text-ink">{money(rowNet)}</b> · Ödenen <b className="text-ink">{money(row.collection)}</b>
            {tone !== "zero" && (
              <>
                {" → "}
                <b className={tone === "debt" ? "text-debt" : "text-credit"}>
                  {money(Math.abs(rowDelta))} {tone === "debt" ? "borç yazıldı" : "fazla ödedi"}
                </b>
              </>
            )}
          </p>

          <div className="order-last flex basis-full items-center justify-between gap-3 rounded-xl border border-edge px-3 py-2 xl:hidden">
            <span className="text-[0.82rem] font-semibold text-ink-2">Toplam hesap</span>
            <span className="flex items-center gap-2">
              <Balance value={total} />
              <BalanceBadge value={total} kind="total" />
            </span>
          </div>

          <p className="tnum hidden min-h-11 items-center justify-end text-[1rem] font-semibold xl:flex">{money(rowNet)}</p>
          <div className="hidden min-h-11 flex-col items-end justify-center xl:flex">
            <Balance value={rowDelta} />
            <BalanceBadge value={rowDelta} kind="delta" />
          </div>
          <div className="hidden min-h-11 flex-col items-end justify-center xl:flex">
            <Balance value={total} className="text-[1.02rem]" />
            <BalanceBadge value={total} kind="total" />
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1 xl:min-h-11">
            {!readOnly && (
              <span className="hidden xl:block">
                <AddLineMenu products={missing} disabled={addingLine} onPick={addProduct} />
              </span>
            )}
            {!readOnly && (
              <button
                type="button"
                disabled={deleting}
                onClick={() =>
                  confirmDelete
                    ? startDelete(async () => {
                        const res = await deleteOrder(row.id);
                        if (res.ok) toast(`${row.customer_name} bu günden çıkarıldı.`);
                        else toast(res.error, "error");
                      })
                    : setConfirmDelete(true)
                }
                className={cx(
                  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[0.82rem] font-semibold whitespace-nowrap transition-all duration-200",
                  confirmDelete ? "bg-debt px-3 text-white" : "w-10 text-ink-3 hover:bg-debt-soft hover:text-debt",
                )}
                aria-label={confirmDelete ? "Silmeyi onayla" : `${row.customer_name} satırını sil`}
              >
                {confirmDelete ? (deleting ? "Siliniyor" : "Sil?") : <Trash2 size={17} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Satırın en sağındaki "+": müşterinin henüz eklenmemiş ürünlerinden birini ekler. */
function AddLineMenu({
  products,
  disabled,
  onPick,
}: {
  products: CustomerProduct[];
  disabled: boolean;
  onPick: (productId: number) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest("[data-add-line]")) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (products.length === 0) return <span className="hidden w-10 xl:block" aria-hidden />;

  return (
    <div data-add-line className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "grid size-10 place-items-center rounded-xl transition-all duration-200",
          open ? "brand-fill" : "bg-brand-soft text-brand-deep hover:brightness-95 dark:text-brand",
        )}
        aria-label="Ürün ekle"
        title="Ürün ekle"
      >
        {disabled ? <Loader2 size={17} className="animate-spin" /> : <Plus size={18} strokeWidth={2.5} />}
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop absolute top-full right-0 z-30 mt-1.5 flex w-52 flex-col gap-0.5 rounded-2xl border border-edge bg-surface p-1.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)]"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-[0.72rem] font-semibold text-ink-3">Ürün ekle</p>
          {products.map((p) => (
            <button
              key={p.product_id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(p.product_id);
              }}
              className="flex min-h-10 items-center justify-between gap-3 rounded-xl px-2.5 text-left text-[0.9rem] font-semibold hover:bg-brand-soft"
            >
              <span className="truncate">{p.name}</span>
              <span className="tnum shrink-0 text-[0.78rem] font-medium text-ink-3">{money(p.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bir ürün satırı: ürün · verilen · iade · tutar. Çıkınca kaydeder. */
function LineRow({
  line,
  customerName,
  readOnly,
  removable,
  onDraft,
  onSaved,
  onError,
}: {
  line: BoardLine;
  customerName: string;
  readOnly: boolean;
  removable: boolean;
  onDraft: (patch: Partial<BoardLine>) => void;
  onSaved: (order: OrderTotals) => void;
  onError: () => void;
}) {
  const [d, setD] = useState(line.delivered_qty ? String(line.delivered_qty) : "");
  const [r, setR] = useState(line.returned_qty ? String(line.returned_qty) : "");
  const [saved, setSaved] = useState({ d: line.delivered_qty, r: line.returned_qty });
  const [removing, startRemove] = useTransition();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(false), 1500);
    return () => clearTimeout(t);
  }, [ok]);

  async function commit() {
    if (line.delivered_qty === saved.d && line.returned_qty === saved.r) return;
    const res = await saveLine(line.id, line.delivered_qty, line.returned_qty);
    if (res.ok && res.data) {
      setSaved({ d: res.data.line.delivered_qty, r: res.data.line.returned_qty });
      onDraft({ unit_price: Number(res.data.line.unit_price) });
      onSaved(res.data.order);
      setOk(true);
    } else if (!res.ok) {
      onError();
      toast(`${customerName}: ${res.error}`, "error");
    }
  }

  const unit = line.product_unit || "adet";
  const amount = (line.delivered_qty - line.returned_qty) * line.unit_price;
  const empty = line.delivered_qty === 0 && line.returned_qty === 0;

  return (
    <div className={cx("grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 xl:items-center", LINE_GRID)}>
      <div className="col-span-2 flex min-w-0 items-center gap-2 xl:col-span-1">
        <p className="min-w-0 truncate text-[0.9rem] font-semibold">
          {line.product_name}
          <span className="tnum ml-1.5 text-[0.76rem] font-medium text-ink-3">{money(line.unit_price)}</span>
        </p>
        {ok && <Check size={13} strokeWidth={3} className="animate-pop shrink-0 text-brand-deep dark:text-brand" />}
        {!readOnly && removable && empty && (
          <button
            type="button"
            disabled={removing}
            onClick={() =>
              startRemove(async () => {
                const res = await deleteLine(line.id);
                if (!res.ok) toast(res.error, "error");
              })
            }
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-debt-soft hover:text-debt"
            aria-label={`${line.product_name} satırını kaldır`}
            title="Satırı kaldır"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <NumberBox
        label="Verilen"
        unit={unit}
        value={d}
        readOnly={readOnly}
        onChange={(v) => {
          setD(v);
          onDraft({ delivered_qty: Math.max(0, Math.trunc(parseAmount(v) ?? 0)) });
        }}
        onCommit={commit}
        ariaLabel={`${customerName} ${line.product_name} verilen`}
      />
      <NumberBox
        label="İade"
        unit={unit}
        value={r}
        readOnly={readOnly}
        onChange={(v) => {
          setR(v);
          onDraft({ returned_qty: Math.max(0, Math.trunc(parseAmount(v) ?? 0)) });
        }}
        onCommit={commit}
        ariaLabel={`${customerName} ${line.product_name} iade`}
      />
      <p className="tnum hidden text-right text-[0.88rem] font-semibold text-ink-2 xl:block">{money(amount)}</p>
    </div>
  );
}

function DayTotals({ rows }: { rows: BoardRow[] }) {
  const dayDelta = sum(rows, delta);
  const items = [
    { label: "Verilen", value: `${qty(sum(rows, delivered))} adet`, icon: ArrowUpRight, tone: "brand" as const },
    { label: "İade", value: `${qty(sum(rows, returned))} adet`, icon: ArrowDownLeft, tone: "amber" as const },
    { label: "Tutar", value: money(sum(rows, net)), icon: Receipt, tone: "neutral" as const },
    { label: "Alınan para", value: money(sum(rows, (r) => r.collection)), icon: HandCoins, tone: "sky" as const },
  ];
  return (
    <div className="m-3 mt-4 grid grid-cols-2 gap-4 rounded-2xl neu-inset p-4 sm:m-4 md:grid-cols-5 xl:m-6 xl:p-5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3">
          <IconChip icon={it.icon} tone={it.tone} size="sm" />
          <div className="min-w-0">
            <p className="text-[0.75rem] font-semibold text-ink-3">{it.label}</p>
            <p className="tnum truncate font-display text-[1.1rem] font-semibold">{it.value}</p>
          </div>
        </div>
      ))}
      <div className="col-span-2 flex items-center gap-3 md:col-span-1">
        <IconChip icon={Scale} tone={balanceTone(dayDelta) === "debt" ? "debt" : "brand"} size="sm" />
        <div>
          <p className="text-[0.75rem] font-semibold text-ink-3">Günün sonucu</p>
          <Balance value={dayDelta} className="font-display text-[1.1rem]" />
        </div>
      </div>
    </div>
  );
}

// --- Müşteri ekleme ----------------------------------------------------------

function AddCustomersForm({
  day,
  driverId,
  customers,
  taken,
  onClose,
}: {
  day: string;
  driverId?: number;
  customers: BoardCustomer[];
  taken: Set<number>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();

  const available = customers.filter((c) => !taken.has(c.id));
  const q = query.trim().toLocaleLowerCase("tr");
  const visible = q ? available.filter((c) => c.name.toLocaleLowerCase("tr").includes(q)) : available;

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    start(async () => {
      const res = await addCustomersToDay(day, [...picked], driverId);
      if (res.ok) {
        toast(`${picked.size} müşteri eklendi. Şimdi sayıları yazabilirsiniz.`);
        onClose();
      } else toast(res.error, "error");
    });
  }

  if (available.length === 0) {
    return (
      <Empty title="Eklenecek müşteri kalmadı">
        Tüm aktif müşteriler bu günün listesinde.{" "}
        <Link href="/musteriler" className="font-semibold text-brand-deep underline dark:text-brand">
          Yeni müşteri oluşturun
        </Link>
        .
      </Empty>
    );
  }

  const allVisiblePicked = visible.length > 0 && visible.every((c) => picked.has(c.id));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9rem] text-ink-2">Bu gün ekmek verdiğiniz müşterilere dokunun, sonra alttaki yeşil butona basın.</p>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="İsimle ara"
          className={cx(inputClass, "pl-11")}
          aria-label="Müşteri ara"
        />
      </div>

      <div className="flex items-center justify-between text-[0.88rem]">
        <span className="font-semibold text-ink-2">{picked.size} müşteri seçildi</span>
        <button
          type="button"
          className="rounded-lg px-2 py-1 font-semibold text-brand-deep hover:bg-brand-soft dark:text-brand"
          onClick={() =>
            setPicked((prev) => (allVisiblePicked ? new Set() : new Set([...prev, ...visible.map((c) => c.id)])))
          }
        >
          {allVisiblePicked ? "Seçimi kaldır" : "Hepsini seç"}
        </button>
      </div>

      <ul className="-mx-3 flex max-h-[45dvh] flex-col gap-2.5 overflow-y-auto px-3 py-2">
        {visible.map((c) => {
          const on = picked.has(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                className={cx(
                  "flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left transition-all duration-200",
                  on ? "bg-brand-soft ring-2 ring-brand" : "neu-sm",
                )}
              >
                <span className="min-w-0 truncate text-[1rem] font-semibold">{c.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tnum max-w-[45%] truncate text-[0.8rem] text-ink-3">{c.products.map((p) => p.name).join(" · ") || "Ürün yok"}</span>
                  <span
                    className={cx(
                      "grid size-7 place-items-center rounded-full transition-all duration-200",
                      on ? "brand-fill" : "neu-inset",
                    )}
                  >
                    {on && <Check size={15} strokeWidth={3} className="animate-pop" />}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <li className="py-6 text-center text-ink-2">Aramaya uyan müşteri yok.</li>}
      </ul>

      <Button variant="primary" onClick={submit} disabled={pending || picked.size === 0} className="min-h-14 w-full text-[1rem]">
        {pending ? "Ekleniyor…" : picked.size ? `${picked.size} müşteriyi ekle` : "Önce müşteri seçin"}
      </Button>
    </div>
  );
}
