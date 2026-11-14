import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { addDays, longDate, weekdayLong } from "@/lib/format";

/** Önceki gün / tarih / sonraki gün / bugüne dön. `base` sayfanın yolu (ör. "/tezgah"). */
export function DayNav({ base, day, today }: { base: string; day: string; today: string }) {
  const nav = (d: string) => `${base}?gun=${d}`;
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
      <Link href={nav(addDays(day, -1))} className={buttonClass("soft", "w-12 px-0")} aria-label="Önceki gün" scroll={false}>
        <ChevronLeft size={22} strokeWidth={2.4} />
      </Link>
      <div className="neu-inset flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-control px-4 text-center sm:min-w-60 sm:flex-none">
        <span className="text-[0.92rem] font-semibold whitespace-nowrap">{longDate(day)}</span>
        <span className="text-[0.72rem] font-semibold text-ink-3">{day === today ? "Bugün" : weekdayLong(day)}</span>
      </div>
      <Link href={nav(addDays(day, 1))} className={buttonClass("soft", "w-12 px-0")} aria-label="Sonraki gün" scroll={false}>
        <ChevronRight size={22} strokeWidth={2.4} />
      </Link>
      {day !== today && (
        <Link href={base} className={buttonClass("primary", "w-full whitespace-nowrap sm:w-auto")} scroll={false}>
          <CalendarCheck size={17} /> Bugüne dön
        </Link>
      )}
    </div>
  );
}
