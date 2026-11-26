import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/giris", "/cikis", "/api/saglik"];

// Giriş yapmamış kullanıcıyı giriş sayfasına yönlendirir. Yalnızca çerezin imzasına bakar;
// hesabın aktif olup olmadığını sayfalar ve procedure'lar veritabanından denetler.
export function proxy(request: NextRequest) {
  const signedIn = verifyToken(request.cookies.get(SESSION_COOKIE)?.value) != null;
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (signedIn && pathname === "/giris") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
