"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, CopyPlus, Lock, Plus, Search, Trash2 } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { Balance, Button, Empty, cx, inputClass } from "@/components/ui";
import { addCustomersToDay, copyDayFromLastWeek, deleteOrder, saveOrder } from "@/lib/actions";
import { longDate, money, parseAmount, qty, weekdayLong, weekdayShort } from "@/lib/format";

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
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copying, startCopy] = useTransition();

  // Ekle/sil sonrası sunucudan gelen güncel liste.
  const [lastServerRows, setLastServerRows] = useState(serverRows);
  if (serverRows !== lastServerRows) {
    setLastServerRows(serverRows);
    setRows(serverRows);
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

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
      setNotice(
        res.ok
          ? { tone: "ok", text: `${res.data} müşteri geçen haftadan eklendi.` }
          : { tone: "error", text: res.error },
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Gün şeridi */}
      <div className="grid grid-cols-7 gap-1.5 xs:gap-2 sm:gap-3" role="tablist" aria-label="Haftanın günleri">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const active = d === day;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectDay(d)}
              className={cx(
                "relative flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-1 py-2.5 transition-shadow sm:items-start sm:px-3.5 sm:py-3",
                active ? "neu-pressed" : "neu-sm",
              )}
            >
              <span className={cx("text-[0.72rem] font-semibold sm:text-[0.78rem]", active ? "text-ink" : "text-ink-2")}>
                {weekdayShort(d)}
              </span>
              <span className="font-display tnum text-[1.25rem] leading-none font-semibold text-ink sm:text-[1.5rem]">
                {Number(d.slice(8))}
              </span>
              <span className="tnum mt-1 hidden text-[0.75rem] text-ink-3 sm:block">
                {list.length ? `${list.length} müşteri` : "Boş"}
              </span>
              <span className="tnum hidden truncate text-[0.78rem] font-semibold text-ink-2 sm:block sm:max-w-full">
                {list.length ? money(sum(list, net)) : "—"}
              </span>
              <span
                className={cx(
                  "mt-1 size-1.5 rounded-full sm:absolute sm:top-3 sm:right-3 sm:mt-0",
                  d === today ? "bg-wheat-deep" : list.length ? "bg-ink-3/50" : "bg-transparent",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {/* Gün paneli */}
      <section className="neu rounded-tile">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="font-display text-[1.35rem] font-semibold tracking-tight">
              {weekdayLong(day)}
              <span className="ml-2 font-sans text-[0.95rem] font-medium text-ink-3">{longDate(day)}</span>
            </h2>
            {locked && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-[0.85rem] text-ink-2">
                <Lock size={14} /> Geçmiş hafta — kayıtlar sadece görüntülenir.
              </p>
            )}
          </div>
          {!locked && (
            <div className="flex flex-wrap gap-2.5">
              <Button onClick={copyLastWeek} disabled={copying} className="flex-1 sm:flex-none">
                <CopyPlus size={17} />
                {copying ? "Ekleniyor…" : "Geçen haftadan"}
              </Button>
              <Button variant="primary" onClick={() => setAdding(true)} className="flex-1 sm:flex-none">
                <Plus size={18} /> Müşteri ekle
              </Button>
            </div>
          )}
        </div>

        {notice && (
          <p
            role="status"
            className={cx(
              "mx-5 mb-4 rounded-control px-3.5 py-2.5 text-[0.88rem] font-medium sm:mx-6",
              notice.tone === "ok" ? "bg-credit-soft text-credit" : "bg-debt-soft text-debt",
            )}
          >
            {notice.text}
          </p>
        )}

        {dayRows.length === 0 ? (
          <Empty title="Bu güne henüz müşteri eklenmedi">
            {locked
              ? "Bu gün için kayıt yok."
              : "Müşteri ekleyin ya da geçen haftanın aynı günündeki listeyi tek dokunuşla getirin."}
          </Empty>
        ) : (
          <>
            <div className="hidden border-y border-line px-6 py-2.5 text-[0.78rem] font-semibold text-ink-3 lg:grid lg:grid-cols-[minmax(11rem,1.7fr)_repeat(3,minmax(5.5rem,1fr))_minmax(6rem,1fr)_minmax(6.5rem,1fr)_2.75rem] lg:gap-4">
              <span>Müşteri</span>
              <span>Verilen</span>
              <span>İade</span>
              <span>Tahsilat</span>
              <span className="text-right">Tutar</span>
              <span className="text-right">Fark</span>
              <span />
            </div>
            <ul className="flex flex-col gap-3 px-3 pb-3 sm:px-4 lg:gap-0 lg:px-0 lg:pb-0">
              {dayRows.map((r) => (
                <OrderRow
                  key={r.id}
                  row={r}
                  readOnly={locked || r.is_locked}
                  onDraft={(p) => patchRow(r.id, p)}
                  onError={(text) => setNotice({ tone: "error", text })}
                />
              ))}
            </ul>
            <DayTotals rows={dayRows} />
          </>
        )}
      </section>

      <AddCustomersSheet
        open={adding}
        onClose={() => setAdding(false)}
        day={day}
        customers={customers}
        taken={new Set(dayRows.map((r) => r.customer_id))}
        onDone={(n) => setNotice({ tone: "ok", text: `${n} müşteri eklendi.` })}
      />
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

function OrderRow({
  row,
  readOnly,
  onDraft,
  onError,
}: {
  row: BoardRow;
  readOnly: boolean;
  onDraft: (patch: Partial<BoardRow>) => void;
  onError: (text: string) => void;
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

  function update(field: keyof typeof draft, value: string) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    const d = Math.max(0, Math.trunc(parseAmount(next.delivered) ?? 0));
    const r = Math.max(0, Math.trunc(parseAmount(next.returned) ?? 0));
    const c = Math.max(0, parseAmount(next.collection) ?? 0);
    onDraft({ delivered_qty: d, returned_qty: r, collection: c });
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
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1500);
    } else if (!res.ok) {
      setState("idle");
      onError(res.error);
    }
  }

  const fieldProps = (field: keyof typeof draft, decimal = false) => ({
    value: draft[field],
    readOnly,
    "data-entry": true,
    inputMode: decimal ? ("decimal" as const) : ("numeric" as const),
    enterKeyHint: "next" as const,
    placeholder: "0",
    autoComplete: "off",
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      update(field, e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, "")),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        focusNext(e.currentTarget);
      }
    },
    className: cx(inputClass, "text-right font-semibold", readOnly && "shadow-none bg-transparent"),
  });

  const rowNet = net(row);
  const rowDelta = delta(row);

  return (
    <li className="neu-sm rounded-2xl p-4 lg:rounded-none lg:border-b lg:border-line lg:bg-transparent lg:px-6 lg:py-3 lg:shadow-none">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(11rem,1.7fr)_repeat(3,minmax(5.5rem,1fr))_minmax(6rem,1fr)_minmax(6.5rem,1fr)_2.75rem] lg:items-center lg:gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/musteriler/${row.customer_id}`}
              className="block truncate font-semibold text-ink hover:underline"
            >
              {row.customer_name}
            </Link>
            <p className="tnum flex items-center gap-1.5 text-[0.8rem] text-ink-3">
              {money(row.unit_price)} / adet
              {state === "saving" && <span className="text-ink-2">· kaydediliyor</span>}
              {state === "saved" && (
                <span className="inline-flex items-center gap-0.5 text-credit">
                  <Check size={13} /> kaydedildi
                </span>
              )}
            </p>
          </div>
          <div className="text-right lg:hidden">
            <p className="text-[0.72rem] font-semibold text-ink-3">Fark</p>
            <Balance value={rowDelta} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 lg:contents">
          <label className="flex flex-col gap-1 lg:block">
            <span className="text-[0.72rem] font-semibold text-ink-3 lg:sr-only">Verilen</span>
            <input {...fieldProps("delivered")} aria-label={`${row.customer_name} verilen ekmek`} />
          </label>
          <label className="flex flex-col gap-1 lg:block">
            <span className="text-[0.72rem] font-semibold text-ink-3 lg:sr-only">İade</span>
            <input {...fieldProps("returned")} aria-label={`${row.customer_name} iade ekmek`} />
          </label>
          <label className="flex flex-col gap-1 lg:block">
            <span className="text-[0.72rem] font-semibold text-ink-3 lg:sr-only">Tahsilat ₺</span>
            <input {...fieldProps("collection", true)} aria-label={`${row.customer_name} tahsilat`} />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 lg:contents">
          <p className="tnum text-[0.85rem] text-ink-2 lg:text-right lg:text-[0.95rem] lg:font-semibold lg:text-ink">
            <span className="lg:hidden">Tutar </span>
            {money(rowNet)}
          </p>
          <p className="hidden text-right lg:block">
            <Balance value={rowDelta} />
          </p>
          {!readOnly ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() =>
                confirmDelete
                  ? startDelete(async () => {
                      const res = await deleteOrder(row.id);
                      if (!res.ok) onError(res.error);
                    })
                  : setConfirmDelete(true)
              }
              className={cx(
                "grid h-9 place-items-center rounded-full text-[0.8rem] font-semibold transition-colors lg:justify-self-end",
                confirmDelete ? "bg-debt-soft px-3 text-debt" : "w-9 text-ink-3 hover:text-debt",
              )}
              aria-label={confirmDelete ? "Silmeyi onayla" : `${row.customer_name} satırını sil`}
            >
              {confirmDelete ? (deleting ? "Siliniyor" : "Sil?") : <Trash2 size={16} />}
            </button>
          ) : (
            <span className="hidden lg:block" />
          )}
        </div>
      </div>
    </li>
  );
}

function DayTotals({ rows }: { rows: BoardRow[] }) {
  const items = [
    { label: "Verilen", value: qty(sum(rows, (r) => r.delivered_qty)) },
    { label: "İade", value: qty(sum(rows, (r) => r.returned_qty)) },
    { label: "Tutar", value: money(sum(rows, net)) },
    { label: "Tahsilat", value: money(sum(rows, (r) => r.collection)) },
  ];
  const dayDelta = sum(rows, delta);
  return (
    <div className="m-3 mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl neu-inset p-4 sm:m-4 sm:grid-cols-5 lg:m-6">
      {items.map((it) => (
        <div key={it.label}>
          <p className="text-[0.75rem] font-semibold text-ink-3">{it.label}</p>
          <p className="tnum font-display text-[1.1rem] font-semibold">{it.value}</p>
        </div>
      ))}
      <div className="col-span-2 sm:col-span-1">
        <p className="text-[0.75rem] font-semibold text-ink-3">Gün farkı</p>
        <Balance value={dayDelta} className="font-display text-[1.1rem]" />
      </div>
    </div>
  );
}

// --- Müşteri ekleme ----------------------------------------------------------

function AddCustomersSheet({
  open,
  onClose,
  day,
  customers,
  taken,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  day: string;
  customers: BoardCustomer[];
  taken: Set<number>;
  onDone: (count: number) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`${weekdayLong(day)} için müşteri ekle`}>
      <AddCustomersForm day={day} customers={customers} taken={taken} onClose={onClose} onDone={onDone} />
    </Sheet>
  );
}

function AddCustomersForm({
  day,
  customers,
  taken,
  onClose,
  onDone,
}: {
  day: string;
  customers: BoardCustomer[];
  taken: Set<number>;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
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
        onDone(picked.size);
        onClose();
      } else setError(res.error);
    });
  }

  if (available.length === 0) {
    return (
      <Empty title="Eklenecek müşteri kalmadı">
        Tüm aktif müşteriler bu günün listesinde.{" "}
        <Link href="/musteriler" className="font-semibold text-ink underline">
          Yeni müşteri oluşturun
        </Link>
        .
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Müşteri ara"
          className={cx(inputClass, "pl-10")}
          aria-label="Müşteri ara"
        />
      </div>

      <div className="flex items-center justify-between text-[0.85rem]">
        <span className="text-ink-2">{picked.size} seçili</span>
        <button
          type="button"
          className="font-semibold text-ink-2 hover:text-ink"
          onClick={() =>
            setPicked((prev) =>
              visible.every((c) => prev.has(c.id)) ? new Set() : new Set([...prev, ...visible.map((c) => c.id)]),
            )
          }
        >
          {visible.length > 0 && visible.every((c) => picked.has(c.id)) ? "Seçimi kaldır" : "Tümünü seç"}
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
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-control px-4 text-left transition-shadow",
                  on ? "neu-pressed" : "neu-sm",
                )}
              >
                <span className="min-w-0 truncate font-semibold">{c.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tnum text-[0.82rem] text-ink-3">{money(c.current_price)}</span>
                  <span
                    className={cx(
                      "grid size-6 place-items-center rounded-full",
                      on ? "wheat-fill" : "neu-inset",
                    )}
                  >
                    {on && <Check size={14} />}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <li className="py-6 text-center text-ink-2">Aramaya uyan müşteri yok.</li>}
      </ul>

      {error && (
        <p role="alert" className="rounded-control bg-debt-soft px-3.5 py-2.5 text-[0.88rem] font-medium text-debt">
          {error}
        </p>
      )}

      <Button variant="primary" onClick={submit} disabled={pending || picked.size === 0} className="w-full">
        {pending ? "Ekleniyor…" : picked.size ? `${picked.size} müşteriyi ekle` : "Müşteri seçin"}
      </Button>
    </div>
  );
}
