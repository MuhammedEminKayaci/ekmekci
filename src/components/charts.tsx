import { TrendingDown, TrendingUp } from "lucide-react";
import { cx } from "@/components/ui";

/** Önceki döneme göre değişim rozeti. `goodWhenUp=false` iade gibi azalması iyi olanlar için. */
export function Delta({
  value,
  goodWhenUp = true,
  suffix,
  onDark = false,
}: {
  value: number | null;
  goodWhenUp?: boolean;
  suffix?: string;
  onDark?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className={cx("text-[0.78rem] font-medium", onDark ? "text-white/70" : "text-ink-3")}>Karşılaştırma yok</span>;
  }
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? TrendingUp : TrendingDown;
  const text = `%${Math.abs(value).toLocaleString("tr-TR", { maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 })}`;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-bold tnum",
          onDark ? "bg-white/20 text-white" : good ? "bg-credit-soft text-credit" : "bg-debt-soft text-debt",
        )}
      >
        <Icon size={13} strokeWidth={2.6} />
        {text}
      </span>
      {suffix && <span className={cx("text-[0.76rem]", onDark ? "text-white/75" : "text-ink-3")}>{suffix}</span>}
    </span>
  );
}

/** Kendini çizerek açılan alan + çizgi grafiği (yeşil kart üstünde). */
export function Sparkline({
  values,
  height = 64,
  className,
}: {
  values: number[];
  height?: number;
  className?: string;
}) {
  const w = 300;
  const h = height;
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * stepX, h - 4 - (v / max) * (h - 10)] as const);

  // Yumuşak eğri (Catmull-Rom → Bezier)
  let line = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    line += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];

  return (
    <div className={cx("relative w-full", className)} style={{ height }} aria-hidden>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="size-full overflow-visible">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.32" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" className="animate-fade" />
      <path
        d={line}
        pathLength={1}
        fill="none"
        stroke="white"
        strokeWidth={2.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="animate-draw"
      />
    </svg>
      <span
        className="animate-pop absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.25)]"
        style={{ left: `${(last[0] / w) * 100}%`, top: `${(last[1] / h) * 100}%`, animationDelay: "1.2s" }}
      />
    </div>
  );
}

/** Yüzde göstergesi (0–1). */
export function Gauge({ ratio, label, tone = "brand" }: { ratio: number | null; label: string; tone?: "brand" | "sky" }) {
  const v = ratio == null ? 0 : Math.max(0, Math.min(1, ratio)) * 100;
  const color = tone === "sky" ? "var(--series-collect)" : "var(--series-sale)";
  return (
    <div className="relative grid size-[6.5rem] shrink-0 place-items-center">
      <svg viewBox="0 0 42 42" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="21" cy="21" r="17" fill="none" stroke="var(--bg-deep)" strokeWidth="4.5" />
        <circle
          cx="21"
          cy="21"
          r="17"
          fill="none"
          stroke={color}
          strokeWidth="4.5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100 100"
          strokeDashoffset={100 - v}
          className="animate-gauge"
        />
      </svg>
      <div className="text-center">
        <p className="font-display tnum text-[1.35rem] leading-none font-semibold">
          {ratio == null ? "—" : `%${Math.round(v)}`}
        </p>
        <p className="mt-0.5 text-[0.65rem] font-semibold text-ink-3">{label}</p>
      </div>
    </div>
  );
}
