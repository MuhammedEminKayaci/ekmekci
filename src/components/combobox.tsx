"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cx, inputClass } from "@/components/ui";

export type ComboOption = { key: string; label: string; hint?: string; badge?: React.ReactNode };

const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

/**
 * Yazdıkça süzülen seçim kutusu. Liste ne kadar uzarsa uzasın sayfa uzamaz:
 * en çok `limit` sonuç gösterilir, gerisi aramayla bulunur.
 * `free` açıksa listede olmayan bir ad da yazılabilir (yeni ürün gibi).
 */
export function Combobox({
  value,
  onChange,
  options,
  onPick,
  placeholder,
  ariaLabel,
  free = false,
  limit = 8,
  className,
  emptyText = "Sonuç yok",
}: {
  value: string;
  onChange: (text: string) => void;
  options: ComboOption[];
  onPick: (option: ComboOption) => void;
  placeholder: string;
  ariaLabel: string;
  free?: boolean;
  limit?: number;
  className?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const q = norm(value);
    const list = q ? options.filter((o) => norm(o.label).includes(q)) : options;
    // Başı eşleşenler önce.
    return [...list].sort((a, b) => Number(!norm(a.label).startsWith(q)) - Number(!norm(b.label).startsWith(q))).slice(0, limit);
  }, [value, options, limit]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(o: ComboOption) {
    onPick(o);
    setOpen(false);
  }

  const exact = results.some((o) => norm(o.label) === norm(value));

  return (
    <div ref={box} className={cx("relative", className)}>
      <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
      <input
        value={value}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cx(inputClass, "pr-10 pl-10")}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setOpen(true);
          }}
          className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:text-ink"
          aria-label="Temizle"
        >
          <X size={15} />
        </button>
      )}
      {open && (results.length > 0 || value.trim()) && (
        <ul
          id={listId}
          role="listbox"
          className="scroll-soft animate-pop absolute top-full right-0 left-0 z-40 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-edge bg-surface p-1.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)]"
        >
          {results.map((o, i) => (
            <li key={o.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={cx(
                  "flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-[0.9rem]",
                  i === active ? "bg-brand-soft" : "hover:bg-bg-deep",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold">{o.label}</span>
                  {o.badge}
                </span>
                {o.hint && <span className="tnum shrink-0 text-[0.78rem] text-ink-3">{o.hint}</span>}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-2.5 text-[0.85rem] text-ink-3">
              {free && value.trim() ? `“${value.trim()}” yeni olarak eklenecek` : emptyText}
            </li>
          )}
          {free && value.trim() && results.length > 0 && !exact && (
            <li className="border-t border-line px-3 pt-2 pb-1 text-[0.78rem] text-ink-3">
              Listede yoksa yazdığınız ad (“{value.trim()}”) kullanılır.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
