import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { proc } from "@/lib/db";

export type SessionProfile = { id: number; name: string; isAdmin: boolean; isActive: boolean };

/** Oturumdaki kullanıcının profili (istek başına bir kez okunur). */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  // Oturumun süresi saate bakılarak denetlenir: istek anına bağla (ön-çizimde çalışmasın).
  await connection();
  const userId = verifyToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const { sets } = await proc("dbo.sp_User_Get", { UserId: userId });
  const u = sets[0]?.[0] as { UserId: number; FullName: string; Email: string; IsAdmin: boolean; IsActive: boolean } | undefined;
  if (!u) return null;
  return { id: u.UserId, name: u.FullName || u.Email, isAdmin: u.IsAdmin === true, isActive: u.IsActive === true };
});

/** Veri okuyan her sayfa ve işlem: oturum yoksa ya da hesap pasifse giriş sayfasına. */
export async function requireUser(): Promise<SessionProfile> {
  const p = await getSessionProfile();
  // /cikis çerezi siler (pasif ya da silinmiş hesabın geçerli çerezi döngüye girmesin).
  if (!p) redirect("/cikis");
  if (!p.isActive) redirect("/cikis?pasif=1");
  return p;
}
