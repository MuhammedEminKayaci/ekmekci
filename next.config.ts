import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Sayfa yalnızca kendi sunucusundan betik/stil yükler ve yalnızca kendi sunucusuna bağlanır
// (veritabanına yalnızca sunucu bağlanır; tarayıcı hiçbir dış adrese gitmez).
// 'unsafe-inline' Next.js'in sayfa içi başlatma betikleri için gerekli; dış kaynaklı betik yasak.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Sunucuya (IIS + iisnode) yalnızca gereken dosyalar gitsin: .next/standalone
  output: "standalone",
  // Veritabanı sürücüsü paketlenmeden Node'un kendi modülü olarak yüklensin.
  serverExternalPackages: ["mssql", "tedious"],
  // Uygulama next/image kullanmıyor; görsel optimizasyon uç noktası tamamen kapalı.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
