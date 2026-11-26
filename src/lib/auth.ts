// Oturum: imzalı, httpOnly çerez. İçinde yalnızca kullanıcı kimliği ve bitiş zamanı var;
// yetki her istekte veritabanından (kullanıcı aktif mi, yönetici mi) okunur.

import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "ekmekci_oturum";
export const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET tanımlı değil (en az 32 karakter).");
  return s;
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest();

export function createToken(userId: number): string {
  const payload = b64(JSON.stringify({ u: userId, e: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 }));
  return `${payload}.${b64(sign(payload))}`;
}

/** Geçerliyse kullanıcı kimliği, değilse null. */
export function verifyToken(token: string | undefined | null): number | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u: unknown; e: unknown };
    if (typeof u !== "number" || !Number.isSafeInteger(u) || u <= 0) return null;
    if (typeof e !== "number" || e < Date.now() / 1000) return null;
    return u;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86400,
};
