import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { balanceLabel, balanceTone, money, weekRangeLabel } from "@/lib/format";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// --- Yüzeyler ----------------------------------------------------------------

export function Tile({
  className,
  children,
  ...rest
}: ComponentProps<"section"> & { children: ReactNode }) {
  return (
    <section className={cx("neu rounded-tile p-5 sm:p-6", className)} {...rest}>
      {children}
    </section>
  );
}

export function TileTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">{children}</h2>
      {aside}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[2rem] leading-[1.05] font-semibold tracking-[-0.02em] text-ink sm:text-[2.6rem]">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-[60ch] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

// --- Sayılar -----------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.8rem] font-medium text-ink-2">{label}</p>
      <p
        className={cx(
          "font-display tnum mt-1 truncate font-semibold tracking-[-0.02em] text-ink",
          size === "lg" ? "text-[2.1rem] leading-none sm:text-[2.6rem]" : "text-[1.45rem] leading-tight",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[0.8rem] text-ink-3">{hint}</p>}
    </div>
  );
}

/** + borçlu (kırmızı), − alacaklı (yeşil). */
export function Balance({ value, className }: { value: number; className?: string }) {
  const tone = balanceTone(value);
  return (
    <span
      className={cx(
        "tnum font-semibold",
        tone === "debt" && "text-debt",
        tone === "credit" && "text-credit",
        tone === "zero" && "text-ink-3",
        className,
      )}
    >
      {tone === "debt" ? "+" : ""}
      {money(value)}
    </span>
  );
}

export function BalanceBadge({ value }: { value: number }) {
  const tone = balanceTone(value);
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold",
        tone === "debt" && "bg-debt-soft text-debt",
        tone === "credit" && "bg-credit-soft text-credit",
        tone === "zero" && "bg-bg-deep text-ink-3",
      )}
    >
      {balanceLabel(value)}
    </span>
  );
}

export function TypeChip({ type }: { type: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-bg-deep px-2 py-0.5 text-[0.72rem] font-medium text-ink-2">
      {type === 2 ? "Kurumsal" : "Şahıs"}
    </span>
  );
}

// --- Kontroller --------------------------------------------------------------

type ButtonVariant = "primary" | "soft" | "ghost" | "danger";

export function buttonClass(variant: ButtonVariant = "soft", className?: string) {
  return cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-[0.9rem] font-semibold transition-[box-shadow,transform,opacity] duration-150 select-none",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "wheat-fill",
    variant === "soft" && "neu-sm text-ink active:neu-pressed",
    variant === "ghost" && "text-ink-2 hover:text-ink",
    variant === "danger" && "neu-sm text-debt active:neu-pressed",
    className,
  );
}

export function Button({
  variant = "soft",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type="button" className={buttonClass(variant, className)} {...rest} />;
}

export function ButtonLink({
  variant = "soft",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}

export const inputClass =
  "neu-inset tnum w-full min-h-11 rounded-control px-3.5 text-[0.95rem] text-ink placeholder:text-ink-3 outline-none focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-[0.8rem] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[0.78rem] text-ink-3">{hint}</span>}
    </label>
  );
}

export function Segmented({
  items,
  active,
}: {
  items: Array<{ href: string; label: string; value: string }>;
  active: string;
}) {
  return (
    <nav className="neu-inset inline-flex rounded-full p-1" aria-label="Görünüm">
      {items.map((it) => (
        <Link
          key={it.value}
          href={it.href}
          scroll={false}
          aria-current={it.value === active ? "page" : undefined}
          className={cx(
            "rounded-full px-3.5 py-1.5 text-[0.82rem] font-semibold transition-shadow",
            it.value === active ? "neu-sm text-ink" : "text-ink-2 hover:text-ink",
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function WeekNav({
  start,
  hrefFor,
  isCurrent,
  currentHref,
}: {
  start: string;
  hrefFor: (offsetWeeks: number) => string;
  isCurrent: boolean;
  currentHref: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Link href={hrefFor(-1)} className={buttonClass("soft", "w-11 px-0")} aria-label="Önceki hafta" scroll={false}>
        <ChevronLeft size={18} />
      </Link>
      <div className="neu-inset flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-control px-4 text-center text-[0.9rem] font-semibold whitespace-nowrap text-ink sm:flex-none sm:min-w-56">
        {weekRangeLabel(start)}
      </div>
      <Link href={hrefFor(1)} className={buttonClass("soft", "w-11 px-0")} aria-label="Sonraki hafta" scroll={false}>
        <ChevronRight size={18} />
      </Link>
      {!isCurrent && (
        <Link href={currentHref} className={buttonClass("ghost", "px-2")} scroll={false}>
          Bu hafta
        </Link>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="font-display text-[1.1rem] font-semibold text-ink">{title}</p>
      {children && <div className="max-w-[44ch] text-ink-2">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}
