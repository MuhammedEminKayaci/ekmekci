import { cx } from "@/components/ui";

/** Ekmek somunu işareti + yazı. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <span className="wheat-fill grid size-9 place-items-center rounded-[0.8rem]" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 14.5c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5c0 1.4-1.1 2.5-2.5 2.5h-11A2.5 2.5 0 0 1 4 14.5Z" />
          <path d="M9 9.5 8 12.5M12.5 9 11.5 12.5M16 9.5l-1 3" />
        </svg>
      </span>
      <span className="font-display text-[1.3rem] font-bold tracking-[-0.03em] text-ink">Ekmekçi</span>
    </span>
  );
}
