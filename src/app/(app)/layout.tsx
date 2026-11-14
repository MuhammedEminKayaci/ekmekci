import { Suspense } from "react";
import { CircleAlert, LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { Credit } from "@/components/credit";
import { Skeleton, cx } from "@/components/ui";
import { signOut } from "@/lib/actions";
import { getSessionProfile } from "@/lib/session";
import { SideNav, SideNavFallback, TabBar, TabBarFallback } from "./nav";

async function UserCard({ onDark = false }: { onDark?: boolean }) {
  const profile = await getSessionProfile();
  const name = profile?.name ?? "";
  const initial = name.trim().charAt(0).toLocaleUpperCase("tr") || "?";

  return (
    <div className={cx("flex items-center gap-3", onDark && "rounded-2xl bg-white/10 p-2.5")}>
      {onDark && (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[0.95rem] font-bold text-[#0a5a32]">
          {initial}
        </span>
      )}
      {onDark && (
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{name}</p>
          <p className="text-[0.75rem] text-white/60">{profile?.isAdmin ? "Yönetici" : profile?.isActive ? "Kullanıcı" : "Pasif hesap"}</p>
        </div>
      )}
      <form action={signOut}>
        <button
          type="submit"
          className={cx(
            "grid size-11 place-items-center rounded-xl transition-colors duration-200",
            onDark ? "text-white/80 hover:bg-white/15 hover:text-white" : "neu-sm text-ink-2 hover:text-debt",
          )}
          aria-label="Çıkış yap"
          title="Çıkış yap"
        >
          <LogOut size={18} />
        </button>
      </form>
    </div>
  );
}

/** Pasif hesap verilere erişemez (veri tabanı engeller); boş sayfa yerine nedenini göster. */
async function InactiveNotice() {
  const profile = await getSessionProfile();
  if (!profile || profile.isActive) return null;
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl bg-debt-soft p-4 text-debt ring-1 ring-debt/20">
      <CircleAlert size={20} className="mt-0.5 shrink-0" />
      <p className="font-semibold">
        Hesabınız henüz aktif değil; kayıtları göremezsiniz. Yöneticinizden hesabınızı açmasını isteyin.
      </p>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[18.5rem] shrink-0 p-4 lg:block">
        <div className="flex h-full flex-col gap-9 rounded-[1.9rem] bg-[linear-gradient(165deg,var(--side-a),var(--side-b))] p-5 shadow-[0_24px_48px_-20px_rgba(8,60,32,0.55)]">
          <Brand onDark className="px-1 pt-1" />
          <Suspense fallback={<SideNavFallback />}>
            <SideNav />
          </Suspense>
          <div className="mt-auto">
            <Suspense fallback={<Skeleton className="h-16 w-full bg-white/10" />}>
              <UserCard onDark />
            </Suspense>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-6 lg:hidden">
          <Brand />
          <Suspense fallback={<Skeleton className="size-11 rounded-xl" />}>
            <UserCard />
          </Suspense>
        </header>
        <main className="flex-1 px-4 pt-4 pb-44 sm:px-6 lg:px-8 lg:pt-9 lg:pb-20 xl:px-10 3xl:px-14">
          <Suspense fallback={null}>
            <InactiveNotice />
          </Suspense>
          {children}
        </main>
      </div>

      <Suspense fallback={<TabBarFallback />}>
        <TabBar />
      </Suspense>
      <Credit withTabBar />
    </div>
  );
}
