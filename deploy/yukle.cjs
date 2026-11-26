// deploy/out klasörünü FTPS ile sunucuya yükler (tek bağlantı, sırayla, her dosyanın boyutu doğrulanır).
// Sıra: uygulama dosyaları → iisnode.js → web.config (uygulama eksik dosyayla başlamasın).
// Kullanım: node deploy/yukle.cjs [--yalniz-eksik]   (bilgiler .env.local: FTP_HOST, FTP_USER, FTP_PASSWORD)
// Gerekli paket: basic-ftp
const fs = require("fs");
const path = require("path");
const ftp = require("basic-ftp");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "out");
const REMOTE = "/httpdocs/panel";
const onlyMissing = process.argv.includes("--yalniz-eksik");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(path.relative(out, p).split(path.sep).join("/"));
  }
})(out);
const last = ["iisnode.js", "web.config"];
const ordered = [...files.filter((f) => !last.includes(f)).sort(), ...last.filter((f) => files.includes(f))];

(async () => {
  const client = new ftp.Client(60_000);
  await client.access({ host: env.FTP_HOST, user: env.FTP_USER, password: env.FTP_PASSWORD, secure: false }); // sunucu FTPS kabul etmiyor (534)
  const sizes = new Map(); // uzak klasör → (ad → boyut)
  async function remoteSizes(dir) {
    if (!sizes.has(dir)) {
      try { sizes.set(dir, new Map((await client.list(dir)).map((i) => [i.name, i.size]))); }
      catch { sizes.set(dir, new Map()); }
    }
    return sizes.get(dir);
  }
  let up = 0, skip = 0, i = 0;
  const t0 = Date.now();
  for (const rel of ordered) {
    i++;
    const local = path.join(out, rel);
    const size = fs.statSync(local).size;
    const dir = path.posix.dirname(`${REMOTE}/${rel}`);
    const name = path.posix.basename(rel);
    // Atlanabilen yalnız adı içerikten üretilen dosyalar (.next/static) ve paketler (node_modules):
    // aynı ad + aynı boyut = aynı içerik. Uygulama kodu (BUILD_ID, manifestler, sunucu parçaları)
    // her derlemede aynı boyutta kalabilir; onlar HER ZAMAN yüklenir.
    const immutable = rel.startsWith(".next/static/") || rel.startsWith("node_modules/");
    if (onlyMissing && immutable && (await remoteSizes(dir)).get(name) === size) { skip++; continue; }
    await client.ensureDir(dir);
    await client.cd("/");
    await client.uploadFrom(local, `${dir}/${name}`);
    const got = await client.size(`${dir}/${name}`);
    if (got !== size) throw new Error(`Boyut tutmadı: ${rel} yerel ${size} uzak ${got}`);
    up++;
    if (up % 200 === 0) console.log(`${i}/${ordered.length} · ${Math.round((Date.now() - t0) / 1000)} sn`);
  }
  console.log(`TAMAM: ${up} dosya yüklendi, ${skip} zaten vardı · ${Math.round((Date.now() - t0) / 1000)} sn`);
  client.close();
})().catch((e) => {
  console.error("HATA:", e.message);
  process.exit(1);
});
