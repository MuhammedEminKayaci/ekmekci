import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// Oturum çerezini siler ve giriş sayfasına gönderir.
export function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const pasif = url.searchParams.get("pasif") === "1";
  url.pathname = "/giris";
  url.search = pasif ? "?pasif=1" : "";
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
