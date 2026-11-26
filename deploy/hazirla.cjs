// Sunucuya yüklenecek klasörü hazırlar: deploy/out
//   .next/standalone + .next/static + iisnode.js + web.config (gizli bilgiler .env.local'dan)
// Önce: npx next build    Kullanım: node deploy/hazirla.cjs
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "out");
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, ".next", "required-server-files.json"))) {
  console.error("Önce derleyin: npx next build");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(standalone, out, { recursive: true, dereference: true, filter: (src) => path.basename(src) !== "server.js" || path.dirname(src) !== standalone });
fs.cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) fs.cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "iisnode.js"), path.join(out, "iisnode.js"));

let cfg = fs.readFileSync(path.join(__dirname, "web.config.template"), "utf8");
for (const k of ["MSSQL_SERVER", "MSSQL_PORT", "MSSQL_DATABASE", "MSSQL_USER", "MSSQL_PASSWORD", "SESSION_SECRET"]) {
  if (!env[k]) { console.error(`.env.local içinde ${k} yok`); process.exit(1); }
  cfg = cfg.replace(`{{${k}}}`, xml(env[k]));
}
fs.writeFileSync(path.join(out, "web.config"), cfg);
for (const f of [".env", ".env.local", ".env.production"]) fs.rmSync(path.join(out, f), { force: true });

let n = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } })(out);
console.log(`Hazır: ${out} · ${n} dosya · ${(bytes / 1e6).toFixed(1)} MB`);
