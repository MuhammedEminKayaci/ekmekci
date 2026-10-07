"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CopyPlus,
  HandCoins,
  Lock,
  Plus,
  Receipt,
  Scale,
  Search,
  Trash2,
} from "lucide-react";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { Balance, BalanceBadge, Button, Empty, IconChip, cx, inputClass, order } from "@/components/ui";
import { addCustomersToDay, copyDayFromLastWeek, deleteOrder, saveOrder } from "@/lib/actions";
import { balanceTone, longDate, money, parseAmount, qty, weekdayLong, weekdayShort } from "@/lib/format";

export type BoardRow = {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_type: number;
  entry_date: string;
  delivered_qty: number;
  returned_qty: number;
  unit_price: number;
  collection: number;
  is_locked: boolean;
};

export type BoardCustomer = { id: number; name: string; type: number; current_price: number | null };

const net = (r: BoardRow) => (r.delivered_qty - r.returned_qty) * r.unit_price;
const delta = (r: BoardRow) => net(r) - r.collection;

function sum(rows: BoardRow[], f: (r: BoardRow) => number) {
  return rows.reduce((acc, r) => acc + f(r), 0);
}

const GRID =
  "lg:grid lg:grid-cols-[minmax(11rem,1.5fr)_repeat(3,minmax(7rem,1fr))_minmax(6.5rem,0.9fr)_minmax(9rem,1.1fr)_3rem] lg:items-center lg:gap-4";

export function WeekBoard({
  weekStart,
  days,
  today,
  initialDay,
  locked,
  rows: serverRows,
  customers,
}: {
  weekStart: string;
  days: string[];
  today: string;
  initialDay: string;
  locked: boolean;
  rows: BoardRow[];
  customers: BoardCustomer[];
}) {
  const [day, setDay] = useState(initialDay);
  const [rows, setRows] = useState(serverRows);
  const [adding, setAdding] = useState(false);
  const [copying, startCopy] = useTransition();

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

  const dayRows = byDay.get(day) ?? [];

  function selectDay(d: string) {
    setDay(d);
    window.history.replaceState(null, "", `/siparisler?hafta=${weekStart}&gun=${d}`);
  }

  function patchRow(id: number, patch: Partial<BoardRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function copyLastWeek() {
    startCopy(async () => {
      const res = await copyDayFromLastWeek(day);
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
                {list.length ? `${list.length} müşteri` : "Kayıt yok"}
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
            {locked ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-[0.88rem] text-ink-2">
                <Lock size={14} /> Geçmiş hafta. Kayıtlar sadece görüntülenir, değiştirilemez.
              </p>
            ) : (
              dayRows.length > 0 && (
                <p className="mt-1 text-[0.88rem] text-ink-2 lg:hidden">Sayıları yazmanız yeterli, her şey otomatik kaydedilir.</p>
              )
            )}
            {!locked && dayRows.length > 0 && (
              <p className="mt-1 hidden text-[0.88rem] text-ink-2 lg:block">
                Kutucuğa yazın, <kbd className="rounded-md bg-bg-deep px-1.5 py-0.5 text-[0.78rem] font-semibold">Enter</kbd> ile
                sonrakine geçin. Her şey otomatik kaydedilir.
              </p>
            )}
          </div>
          {!locked && (
            <div className="grid grid-cols-2 gap-2.5 sm:flex">
              <Button onClick={copyLastWeek} disabled={copying}>
                <CopyPlus size={18} />
                {copying ? "Getiriliyor…" : "Geçen haftayı getir"}
              </Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus size={19} /> Müşteri ekle
              </Button>
            </div>
          )}
        </div>

        {dayRows.length === 0 ? (
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
              <span>Verilen ekmek</span>
              <span>İade ekmek</span>
              <span>Alınan para</span>
              <span className="text-right">Tutar</span>
              <span className="text-right">Sonuç</span>
              <span />
            </div>
            <ul className="flex flex-col gap-3 px-3 pb-3 sm:px-4 lg:gap-0 lg:px-0 lg:pb-0">
              {dayRows.map((r, i) => (
                <OrderRow key={r.id} index={i} row={r} readOnly={locked || r.is_locked} onDraft={(p) => patchRow(r.id, p)} />
              ))}
            </ul>
            <DayTotals rows={dayRows} />
          </>
        )}
      </section>

      <Sheet open={adding} onClose={() => setAdding(false)} title={`${weekdayLong(day)} için müşteri ekle`}>
        <AddCustomersForm
          day={day}
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
    <label className="flex min-w-0 flex-col gap-1 lg:block">
      <span className="text-[0.74rem] font-semibold text-ink-2 lg:sr-only">{label}</span>
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
            "min-h-[3.25rem] pr-3 pl-11 text-right text-[1.08rem] font-semibold",
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
  readOnly,
  onDraft,
}: {
  row: BoardRow;
  index: number;
  readOnly: boolean;
  onDraft: (patch: Partial<BoardRow>) => void;
}) {
  const [draft, setDraft] = useState({
    delivered: row.delivered_qty ? String(row.delivered_qty) : "",
    returned: row.returned_qty ? String(row.returned_qty) : "",
    collection: row.collection
      ? Number.isInteger(row.collection)
        ? String(row.collection)
        : row.collection.toFixed(2).replace(".", ",")
      : "",
  });
  const [saved, setSaved] = useState({ d: row.delivered_qty, r: row.returned_qty, c: row.collection });
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();

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

  function update(field: keyof typeof draft, value: string) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    onDraft({
      delivered_qty: Math.max(0, Math.trunc(parseAmount(next.delivered) ?? 0)),
      returned_qty: Math.max(0, Math.trunc(parseAmount(next.returned) ?? 0)),
      collection: Math.max(0, parseAmount(next.collection) ?? 0),
    });
  }

  async function commit() {
    const d = row.delivered_qty;
    const r = row.returned_qty;
    const c = row.collection;
    if (d === saved.d && r === saved.r && c === saved.c) return;

    setState("saving");
    const res = await saveOrder(row.id, { delivered_qty: d, returned_qty: r, collection: c });
    if (res.ok && res.data) {
      setSaved({ d: res.data.delivered_qty, r: res.data.returned_qty, c: res.data.collection });
      onDraft({ unit_price: res.data.unit_price });
      setState("saved");
    } else if (!res.ok) {
      setState("idle");
      toast(`${row.customer_name}: ${res.error}`, "error");
    }
  }

  const rowNet = net(row);
  const rowDelta = delta(row);
  const tone = balanceTone(rowDelta);

  return (
    <li
      style={order(index)}
      className="neu-sm animate-rise rounded-2xl p-4 lg:rounded-none lg:border-b lg:border-line lg:bg-transparent lg:px-6 lg:py-3.5 lg:shadow-none lg:transition-colors lg:hover:bg-brand-soft/40"
    >
      <div className={cx("flex flex-col gap-3", GRID)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/musteriler/${row.customer_id}`}
              className="block truncate text-[1.02rem] font-semibold text-ink hover:text-brand-deep dark:hover:text-brand"
            >
              {row.customer_name}
            </Link>
            <p className="tnum flex h-5 items-center gap-1.5 text-[0.8rem] text-ink-3">
              Ekmek {money(row.unit_price)}
              {state === "saving" && <span className="text-ink-2">· kaydediliyor…</span>}
              {state === "saved" && (
                <span className="animate-pop inline-flex items-center gap-1 font-semibold text-brand-deep dark:text-brand">
                  <Check size={14} strokeWidth={3} /> Kaydedildi
                </span>
              )}
            </p>
          </div>
          <span className="lg:hidden">
            <BalanceBadge value={rowDelta} kind="delta" />
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:contents">
          <NumberBox
            label="Verilen"
            unit="adet"
            value={draft.delivered}
            readOnly={readOnly}
            onChange={(v) => update("delivered", v)}
            onCommit={commit}
            ariaLabel={`${row.customer_name} verilen ekmek`}
          />
          <NumberBox
            label="İade"
            unit="adet"
            value={draft.returned}
            readOnly={readOnly}
            onChange={(v) => update("returned", v)}
            onCommit={commit}
            ariaLabel={`${row.customer_name} iade ekmek`}
          />
          <NumberBox
            label="Alınan para"
            unit="₺"
            decimal
            value={draft.collection}
            readOnly={readOnly}
            onChange={(v) => update("collection", v)}
            onCommit={commit}
            ariaLabel={`${row.customer_name} tahsilat`}
          />
        </div>

        <div className="flex items-center gap-2 lg:contents">
        {/* Mobil: sonuç cümlesi */}
        <p className="tnum flex-1 rounded-xl bg-bg-deep/70 px-3 py-2 text-[0.85rem] text-ink-2 lg:hidden">
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

        <p className="tnum hidden text-right text-[1rem] font-semibold lg:block">{money(rowNet)}</p>
        <div className="hidden flex-col items-end gap-0.5 lg:flex">
          <Balance value={rowDelta} />
          <BalanceBadge value={rowDelta} kind="delta" />
        </div>

        <div className="shrink-0 lg:block">
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

function DayTotals({ rows }: { rows: BoardRow[] }) {
  const dayDelta = sum(rows, delta);
  const items = [
    { label: "Verilen", value: `${qty(sum(rows, (r) => r.delivered_qty))} adet`, icon: ArrowUpRight, tone: "brand" as const },
    { label: "İade", value: `${qty(sum(rows, (r) => r.returned_qty))} adet`, icon: ArrowDownLeft, tone: "amber" as const },
    { label: "Tutar", value: money(sum(rows, net)), icon: Receipt, tone: "neutral" as const },
    { label: "Alınan para", value: money(sum(rows, (r) => r.collection)), icon: HandCoins, tone: "sky" as const },
  ];
  return (
    <div className="m-3 mt-4 grid grid-cols-2 gap-4 rounded-2xl neu-inset p-4 sm:m-4 md:grid-cols-5 lg:m-6 lg:p-5">
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
  customers,
  taken,
  onClose,
}: {
  day: string;
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
      const res = await addCustomersToDay(day, [...picked]);
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
                  <span className="tnum text-[0.85rem] text-ink-3">{money(c.current_price)}</span>
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
