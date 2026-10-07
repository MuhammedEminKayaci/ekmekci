"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, ClipboardList, LayoutGrid, Users } from "lucide-react";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/", label: "Ana sayfa", short: "Ana sayfa", icon: LayoutGrid },
  { href: "/siparisler", label: "Siparişler", short: "Siparişler", icon: ClipboardList },
  { href: "/musteriler", label: "Müşteriler", short: "Müşteriler", icon: Users },
  { href: "/rapor", label: "Hafta raporu", short: "Rapor", icon: ChartColumn },
] as const;

type IsActive = (href: string) => boolean;
const none: IsActive = () => false;

function useActive(): IsActive {
  const pathname = usePathname();
  return (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
}

/** Masaüstü sol menü. */
export function SideNav() {
  return <SideNavView isActive={useActive()} />;
}

/** Yol bilgisi gelene kadar gösterilen menü. */
export function SideNavFallback() {
  return <SideNavView isActive={none} />;
}

function SideNavView({ isActive }: { isActive: IsActive }) {
  return (
    <nav aria-label="Ana menü" className="flex flex-col gap-2.5">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-12 items-center gap-3 rounded-control px-4 font-semibold transition-shadow",
              active ? "neu-pressed text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            <Icon size={19} className={active ? "text-wheat-deep" : undefined} />
            {label}
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
      <div className="neu mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[1.4rem] p-1.5">
        {ITEMS.map(({ href, short, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.05rem] text-[0.7rem] font-semibold",
                active ? "neu-pressed text-ink" : "text-ink-2",
              )}
            >
              <Icon size={20} className={active ? "text-wheat-deep" : undefined} />
              {short}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
