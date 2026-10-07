"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, ClipboardList, LayoutGrid, Users } from "lucide-react";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/", label: "Ana sayfa", hint: "Günün özeti", icon: LayoutGrid },
  { href: "/siparisler", label: "Siparişler", hint: "Ekmek ve tahsilat gir", icon: ClipboardList },
  { href: "/musteriler", label: "Müşteriler", hint: "Kartlar ve bakiyeler", icon: Users },
  { href: "/rapor", label: "Hafta raporu", hint: "Haftalık toplamlar", icon: ChartColumn },
] as const;

type IsActive = (href: string) => boolean;
const none: IsActive = () => false;

function useActive(): IsActive {
  const pathname = usePathname();
  return (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
}

/** Masaüstü sol menü (yeşil panel). */
export function SideNav() {
  return <SideNavView isActive={useActive()} />;
}

export function SideNavFallback() {
  return <SideNavView isActive={none} />;
}

function SideNavView({ isActive }: { isActive: IsActive }) {
  return (
    <nav aria-label="Ana menü" className="flex flex-col gap-1.5">
      {ITEMS.map(({ href, label, hint, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group flex min-h-14 items-center gap-3.5 rounded-2xl px-3.5 transition-all duration-300 ease-out",
              active
                ? "bg-white text-[#0a5a32] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)] dark:bg-white/12 dark:text-white"
                : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            <span
              className={cx(
                "grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-300",
                active ? "bg-[#0f9150] text-white" : "bg-white/10 text-white group-hover:bg-white/15",
              )}
            >
              <Icon size={18} strokeWidth={2.1} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-tight">{label}</span>
              <span className={cx("block truncate text-[0.75rem]", active ? "text-[#0a5a32]/70 dark:text-white/70" : "text-white/55")}>
                {hint}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobil alt sekme çubuğu. */
export function TabBar() {
  return <TabBarView isActive={useActive()} />;
}

export function TabBarFallback() {
  return <TabBarView isActive={none} />;
}

function TabBarView({ isActive }: { isActive: IsActive }) {
  return (
    <nav
      aria-label="Ana menü"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="neu mx-auto grid max-w-lg grid-cols-4 gap-1 rounded-[1.5rem] p-1.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-[3.75rem] flex-col items-center justify-center gap-1 rounded-[1.1rem] text-[0.72rem] font-semibold transition-all duration-300 ease-out",
                active ? "brand-fill" : "text-ink-2 active:scale-95",
              )}
            >
              <Icon size={21} strokeWidth={2.1} />
              <span className="max-w-full truncate px-1">{label === "Hafta raporu" ? "Rapor" : label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
