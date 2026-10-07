import { cx, order } from "@/components/ui";
import { money, moneyShort } from "@/lib/format";

export type PairPoint = { key: string; label: string; sublabel?: string; sale: number; collect: number; current?: boolean };

/** 0'dan başlayan, okunaklı adımlarla eksen üst sınırı ve çizgileri. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/**
 * Satış ve alınan parayı yan yana gösteren sütun grafiği.
 * y ekseni etiketli, kılavuz çizgili; sütuna gelince (ya da dokununca) değerler görünür.
 */
export function PairChart({ points, height = 200 }: { points: PairPoint[]; height?: number }) {
  const ticks = niceTicks(Math.max(0, ...points.map((p) => Math.max(p.sale, p.collect))));
  const top = ticks[ticks.length - 1] || 1;
  const pct = (v: number) => `${Math.max(0, (v / top) * 100)}%`;
  const cols = { gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` };

  return (
    <figure className="flex flex-col gap-4">
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.82rem] font-medium text-ink-2">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-[3px] bg-series-sale" aria-hidden /> Satış
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-[3px] bg-series-collect" aria-hidden /> Alınan para
        </span>
      </figcaption>

      <div className="flex gap-2 sm:gap-3">
        {/* y ekseni */}
        <div className="relative w-12 shrink-0 sm:w-14" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="tnum absolute right-0 translate-y-1/2 text-[0.68rem] font-medium whitespace-nowrap text-ink-3"
              style={{ bottom: pct(t) }}
            >
              {t === 0 ? "0" : moneyShort(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className={cx("absolute inset-x-0 border-t", t === 0 ? "border-edge-strong" : "border-dashed border-edge")}
                style={{ bottom: pct(t) }}
              />
            ))}
            <ol className="relative grid h-full items-end gap-1 sm:gap-2" style={cols}>
              {points.map((p, i) => (
                <li
                  key={p.key}
                  tabIndex={0}
                  aria-label={`${p.label} ${p.sublabel ?? ""}: satış ${money(p.sale)}, alınan para ${money(p.collect)}`}
                  className={cx(
                    "group relative flex h-full items-end justify-center gap-[3px] rounded-lg outline-none transition-colors duration-200",
                    "hover:bg-brand-soft/70 focus-visible:bg-brand-soft/70",
                    p.current && "bg-brand-soft/40",
                  )}
                >
                  <span
                    className="animate-grow w-full max-w-[1.15rem] rounded-t-[5px] bg-series-sale"
                    style={{ height: pct(p.sale), ...order(i) }}
                  />
                  <span
                    className="animate-grow w-full max-w-[1.15rem] rounded-t-[5px] bg-series-collect"
                    style={{ height: pct(p.collect), ...order(i) }}
                  />
                  <span
                    role="tooltip"
                    className={cx(
                      "neu pointer-events-none absolute bottom-[calc(100%+0.5rem)] z-10 hidden rounded-xl px-3.5 py-2.5 text-[0.8rem] whitespace-nowrap",
                      "group-hover:block group-focus-visible:block",
                      i < points.length / 2 ? "left-0" : "right-0",
                    )}
                  >
                    <span className="mb-1 block font-semibold text-ink">
                      {p.label} {p.sublabel}
                    </span>
                    <span className="tnum flex items-center gap-2 text-ink-2">
                      <span className="size-2 rounded-[2px] bg-series-sale" /> Satış
                      <b className="ml-auto pl-3 text-ink">{money(p.sale)}</b>
                    </span>
                    <span className="tnum flex items-center gap-2 text-ink-2">
                      <span className="size-2 rounded-[2px] bg-series-collect" /> Alınan
                      <b className="ml-auto pl-3 text-ink">{money(p.collect)}</b>
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <ol className="mt-2.5 grid gap-1 sm:gap-2" style={cols} aria-hidden>
            {points.map((p) => (
              <li key={p.key} className="min-w-0 text-center">
                <span
                  className={cx(
                    "block truncate text-[0.72rem] font-semibold",
                    p.current ? "text-brand-deep dark:text-brand" : "text-ink-2",
                  )}
                >
                  {p.label}
                </span>
                {p.sublabel && <span className="block truncate text-[0.66rem] text-ink-3">{p.sublabel}</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </figure>
  );
}
