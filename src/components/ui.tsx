import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { balanceTone, money, weekRangeLabel } from "@/lib/format";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Sıralı giriş animasyonu için gecikme sırası. */
export function order(i: number): CSSProperties {
  return { ["--i" as string]: i };
}

// --- Yüzeyler ----------------------------------------------------------------

export function Tile({
  className,
  children,
  i,
  ...rest
}: ComponentProps<"section"> & { children: ReactNode; i?: number }) {
  return (
    <section
      className={cx("neu animate-rise rounded-tile p-5 sm:p-6", className)}
      style={i != null ? order(i) : undefined}
      {...rest}
    >
      {children}
    </section>
  );
}

export function TileTitle({ children, aside, icon }: { children: ReactNode; aside?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 font-display text-[1.08rem] font-semibold tracking-tight text-ink">
        {icon}
        {children}
      </h2>
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
    <header className="animate-rise mb-6 flex flex-col gap-4 sm:mb-8 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[2rem] leading-[1.05] font-semibold tracking-[-0.025em] text-ink sm:text-[2.5rem]">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-[62ch] text-[0.95rem] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

// --- Renkli simge rozeti ----------------------------------------------------

export type Tone = "brand" | "amber" | "sky" | "debt" | "neutral";

const toneClass: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-deep dark:text-brand",
  amber: "bg-amber-soft text-amber",
  sky: "bg-sky-soft text-sky",
  debt: "bg-debt-soft text-debt",
  neutral: "bg-bg-deep text-ink-2",
};

export function IconChip({ icon: Icon, tone = "brand", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center",
        size === "sm" ? "size-8 rounded-[0.65rem]" : "size-10 rounded-xl",
        toneClass[tone],
      )}
      aria-hidden
    >
      <Icon size={size === "sm" ? 16 : 19} strokeWidth={2.1} />
    </span>
  );
}

// --- Sayılar -----------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  size = "md",
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  size?: "md" | "lg";
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {icon && <IconChip icon={icon} tone={tone} size={size === "lg" ? "md" : "sm"} />}
      <div className="min-w-0">
        <p className="text-[0.82rem] font-semibold text-ink-2">{label}</p>
        <p
          className={cx(
            "font-display tnum mt-0.5 truncate font-semibold tracking-[-0.02em] text-ink",
            size === "lg" ? "text-[2.2rem] leading-none sm:text-[2.7rem]" : "text-[1.4rem] leading-tight",
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-[0.8rem] text-ink-3">{hint}</p>}
      </div>
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

const BADGE_TEXT = {
  balance: { debt: "Borçlu", credit: "Alacaklı", zero: "Hesap kapalı" },
  delta: { debt: "Borç yazıldı", credit: "Fazla ödedi", zero: "Tam ödedi" },
} as const;

/** Bakiyeyi kelimeyle anlatır: renk tek başına bilgi taşımaz. */
export function BalanceBadge({ value, kind = "balance" }: { value: number; kind?: keyof typeof BADGE_TEXT }) {
  const tone = balanceTone(value);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.74rem] font-semibold whitespace-nowrap",
        tone === "debt" && "bg-debt-soft text-debt",
        tone === "credit" && "bg-credit-soft text-credit",
        tone === "zero" && "bg-bg-deep text-ink-2",
      )}
    >
      <span
        className={cx(
          "size-1.5 rounded-full",
          tone === "debt" ? "bg-debt" : tone === "credit" ? "bg-credit" : "bg-ink-3",
        )}
      />
      {BADGE_TEXT[kind][tone]}
    </span>
  );
}

export function TypeChip({ type }: { type: number }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.72rem] font-semibold",
        type === 2 ? "bg-sky-soft text-sky" : "bg-brand-soft text-brand-deep dark:text-brand",
      )}
    >
      {type === 2 ? "Kurumsal" : "Şahıs"}
    </span>
  );
}

// --- Kontroller --------------------------------------------------------------

type ButtonVariant = "primary" | "soft" | "ghost" | "danger";

export function buttonClass(variant: ButtonVariant = "soft", className?: string) {
  return cx(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 text-[0.93rem] font-semibold select-none",
    "transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "brand-fill hover:brightness-[1.06]",
    variant === "soft" && "neu-sm text-ink hover:text-brand-deep dark:hover:text-brand",
    variant === "ghost" && "text-ink-2 hover:bg-brand-soft hover:text-ink",
    variant === "danger" && "neu-sm text-debt",
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
  "neu-inset tnum w-full min-h-12 rounded-control px-4 text-[1rem] text-ink placeholder:text-ink-3 outline-none transition-shadow duration-200 focus:shadow-[inset_0_0_0_2px_var(--brand),inset_3px_3px_7px_var(--sh-dark)] disabled:opacity-60";

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
      <span className="text-[0.85rem] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[0.8rem] text-ink-3">{hint}</span>}
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
            "rounded-full px-4 py-2 text-[0.85rem] font-semibold transition-all duration-300",
            it.value === active ? "brand-fill" : "text-ink-2 hover:text-ink",
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
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
      <Link href={hrefFor(-1)} className={buttonClass("soft", "w-12 px-0")} aria-label="Önceki hafta" scroll={false}>
        <ChevronLeft size={22} strokeWidth={2.4} className="shrink-0" />
      </Link>
      <div className="neu-inset flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-control px-4 text-center sm:min-w-60 sm:flex-none">
        <span className="text-[0.92rem] font-semibold whitespace-nowrap text-ink">{weekRangeLabel(start)}</span>
        <span className="text-[0.72rem] font-semibold text-ink-3">{isCurrent ? "Bu hafta" : "Geçmiş / ileri hafta"}</span>
      </div>
      <Link href={hrefFor(1)} className={buttonClass("soft", "w-12 px-0")} aria-label="Sonraki hafta" scroll={false}>
        <ChevronRight size={22} strokeWidth={2.4} className="shrink-0" />
      </Link>
      {!isCurrent && (
        <Link href={currentHref} className={buttonClass("primary", "w-full whitespace-nowrap sm:w-auto")} scroll={false}>
          <CalendarCheck size={17} /> Bu haftaya dön
        </Link>
      )}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="animate-fade flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon}
      <p className="font-display text-[1.15rem] font-semibold text-ink">{title}</p>
      {children && <div className="max-w-[46ch] text-ink-2">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}
