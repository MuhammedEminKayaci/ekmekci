import { Headset } from "lucide-react";
import { cx } from "@/components/ui";

const PHONE_DISPLAY = "0552 218 34 18";
const PHONE_TEL = "+905522183418";

/** Sağ altta sabit: geliştirici, sürüm ve destek hattı. */
export function Credit({ withTabBar = false }: { withTabBar?: boolean }) {
  return (
    <aside
      aria-label="Uygulama bilgisi ve destek"
      className={cx(
        "fixed right-3 z-30 flex items-center gap-2 rounded-full border border-edge bg-surface/85 py-1.5 pr-3 pl-1.5 text-[0.72rem] text-ink-2 shadow-[0_8px_24px_-12px_rgba(16,60,34,0.35)] backdrop-blur-md sm:right-5 sm:text-[0.76rem]",
        withTabBar ? "bottom-[calc(5.4rem+max(0.6rem,env(safe-area-inset-bottom)))] lg:bottom-5" : "bottom-4 sm:bottom-5",
      )}
    >
      <a
        href={`tel:${PHONE_TEL}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-brand-deep transition-colors hover:bg-brand hover:text-white dark:text-brand"
        title="Sorun olursa arayın"
      >
        <Headset size={14} strokeWidth={2.2} />
        <span className="hidden xs:inline">Destek</span>
        <span className="tnum">{PHONE_DISPLAY}</span>
      </a>
      <a
        href="https://www.kayacimedia.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden font-semibold text-ink hover:text-brand-deep sm:inline dark:hover:text-brand"
      >
        www.kayacimedia.com
      </a>
      <span className="tnum rounded-md bg-bg-deep px-1.5 py-0.5 font-bold text-ink-3">v1.0</span>
    </aside>
  );
}
