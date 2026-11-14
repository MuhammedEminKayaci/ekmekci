import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { addDays, addMonths, longDate, monthLabel, monthStart, weekRangeLabel, weekStart, weekdayLong } from "@/lib/format";

/**
 * Önceki / tarih / sonraki / bugüne dön. `base` sayfanın yolu (ör. "/tezgah").
 * `step` hafta ya da ay olursa oklar o kadar ilerler; `query` diğer adres parametreleri (ör. "donem=ay").
 */
export function DayNav({
  base,
  day,
  today,
  step = "day",
  query,
}: {
  base: string;
  day: string;
  today: string;
  step?: "day" | "week" | "month";
  query?: string;
}) {
  const nav = (d: string) => `${base}?gun=${d}${query ? `&${query}` : ""}`;
  const prev = step === "day" ? addDays(day, -1) : step === "week" ? addDays(day, -7) : addMonths(monthStart(day), -1);
  const next = step === "day" ? addDays(day, 1) : step === "week" ? addDays(day, 7) : addMonths(monthStart(day), 1);
  const isNow =
    step === "day" ? day === today : step === "week" ? weekStart(day) === weekStart(today) : monthStart(day) === monthStart(today);
  const title = step === "day" ? longDate(day) : step === "week" ? weekRangeLabel(weekStart(day)) : monthLabel(monthStart(day));
  const sub = step === "day" ? (day === today ? "Bugün" : weekdayLong(day)) : isNow ? (step === "week" ? "Bu hafta" : "Bu ay") : "";
  const label = step === "day" ? "gün" : step === "week" ? "hafta" : "ay";

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
      <Link href={nav(prev)} className={buttonClass("soft", "w-12 px-0")} aria-label={`Önceki ${label}`} scroll={false}>
        <ChevronLeft size={22} strokeWidth={2.4} />
      </Link>
      <div className="neu-inset flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-control px-4 text-center sm:min-w-60 sm:flex-none">
        <span className="text-[0.92rem] font-semibold whitespace-nowrap">{title}</span>
        {sub && <span className="text-[0.72rem] font-semibold text-ink-3">{sub}</span>}
      </div>
      <Link href={nav(next)} className={buttonClass("soft", "w-12 px-0")} aria-label={`Sonraki ${label}`} scroll={false}>
        <ChevronRight size={22} strokeWidth={2.4} />
      </Link>
      {!isNow && (
        <Link href={query ? `${base}?${query}` : base} className={buttonClass("primary", "w-full whitespace-nowrap sm:w-auto")} scroll={false}>
          <CalendarCheck size={17} /> {step === "day" ? "Bugüne dön" : step === "week" ? "Bu haftaya dön" : "Bu aya dön"}
        </Link>
      )}
    </div>
  );
}
