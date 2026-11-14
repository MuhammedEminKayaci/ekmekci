import { createClient } from "@/lib/supabase/server";

export type SessionProfile = { id: string; name: string; isAdmin: boolean; isActive: boolean };

/** Oturumdaki kullanıcının profili. Yalnızca arayüzü uyarlamak içindir; yetkiyi veri tabanı denetler. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  return {
    id: userId,
    name: profile?.full_name || String(claims?.claims.email ?? ""),
    isAdmin: profile?.role === "admin" && profile.is_active === true,
    isActive: profile?.is_active === true,
  };
}
