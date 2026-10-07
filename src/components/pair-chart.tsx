import { cx } from "@/components/ui";
import { money } from "@/lib/format";

export type PairPoint = { key: string; label: string; sublabel?: string; sale: number; collect: number };

/** Satış ve tahsilatı yan yana gösteren sütun grafiği; üzerine gelince değerler görünür. */
export function PairChart({ points, height = 168 }: { points: PairPoint[]; height?: number }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.sale, p.collect)));
  const pct = (v: number) => `${Math.max(0, (v / max) * 100)}%`;

  return (
    <figure className="flex flex-col gap-4">
      <figcaption className="flex flex-wrap items-center gap-4 text-[0.8rem] text-ink-2">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-[3px] bg-series-sale" aria-hidden /> Net satış
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-[3px] bg-series-collect" aria-hidden /> Tahsilat
        </span>
      </figcaption>

      <div className="relative" style={{ height }}>
        <div className="absolute inset-x-0 bottom-0 border-t border-line" aria-hidden />
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden />
        <ol className="relative grid h-full items-end gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
          {points.map((p) => (
            <li
              key={p.key}
              tabIndex={0}
              aria-label={`${p.label} ${p.sublabel ?? ""}: net satış ${money(p.sale)}, tahsilat ${money(p.collect)}`}
              className="group relative flex h-full items-end justify-center gap-[2px] rounded-lg outline-none hover:bg-bg-deep/60 focus-visible:bg-bg-deep/60"
            >
              <span className="w-full max-w-4 rounded-t-[4px] bg-series-sale" style={{ height: pct(p.sale) }} />
              <span className="w-full max-w-4 rounded-t-[4px] bg-series-collect" style={{ height: pct(p.collect) }} />
              <span
                role="tooltip"
                className={cx(
                  "neu-sm pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-xl px-3 py-2 text-[0.78rem] whitespace-nowrap",
                  "group-hover:block group-focus-visible:block",
                )}
              >
                <span className="block font-semibold text-ink">
                  {p.label} {p.sublabel}
                </span>
                <span className="tnum block text-ink-2">Net satış {money(p.sale)}</span>
                <span className="tnum block text-ink-2">Tahsilat {money(p.collect)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <ol className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }} aria-hidden>
        {points.map((p) => (
          <li key={p.key} className="min-w-0 text-center">
            <span className="block truncate text-[0.72rem] font-semibold text-ink-2">{p.label}</span>
            {p.sublabel && <span className="block truncate text-[0.68rem] text-ink-3">{p.sublabel}</span>}
          </li>
        ))}
      </ol>
    </figure>
  );
}
