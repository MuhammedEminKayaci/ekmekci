import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { Skeleton } from "@/components/ui";
import { signOut } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { SideNav, SideNavFallback, TabBar, TabBarFallback } from "./nav";

async function UserCard({ compact = false }: { compact?: boolean }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("full_name, role").eq("id", userId).maybeSingle()
    : { data: null };

  const name = profile?.full_name || String(claims?.claims.email ?? "");

  return (
    <div className="flex items-center gap-3">
      {!compact && (
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{name}</p>
          <p className="text-[0.78rem] text-ink-3">{profile?.role === "admin" ? "Yönetici" : "Kullanıcı"}</p>
        </div>
      )}
      <form action={signOut}>
        <button
          type="submit"
          className="neu-sm grid size-10 place-items-center rounded-full text-ink-2 active:neu-pressed"
          aria-label="Çıkış yap"
          title="Çıkış yap"
        >
          <LogOut size={17} />
        </button>
      </form>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[90rem]">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-10 p-6 lg:flex">
        <Brand />
        <Suspense fallback={<SideNavFallback />}>
          <SideNav />
        </Suspense>
        <div className="mt-auto">
          <Suspense fallback={<Skeleton className="h-11 w-full" />}>
            <UserCard />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-6 lg:hidden">
          <Brand />
          <Suspense fallback={<Skeleton className="size-10 rounded-full" />}>
            <UserCard compact />
          </Suspense>
        </header>
        <main className="flex-1 px-4 pt-4 pb-32 sm:px-6 lg:px-8 lg:pt-10 lg:pb-12">{children}</main>
      </div>

      <Suspense fallback={<TabBarFallback />}>
        <TabBar />
      </Suspense>
    </div>
  );
}
