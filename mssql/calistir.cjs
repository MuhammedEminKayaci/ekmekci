// Bir SQL dosyasını (GO ile ayrılmış) MSSQL'de, transaction OLMADAN sırayla çalıştırır.
// Kullanım: node mssql/calistir.cjs mssql/05_anlik_guncelleme.sql   (bilgiler .env.local)
// Gerekli paket: mssql
const fs = require("fs");
const path = require("path");
const sql = require("mssql");

const root = path.join(__dirname, "..");
const file = process.argv[2];
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

(async () => {
  const pool = await sql.connect({
    server: env.MSSQL_SERVER, port: Number(env.MSSQL_PORT), database: env.MSSQL_DATABASE,
    user: env.MSSQL_USER, password: env.MSSQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true }, requestTimeout: 120000,
  });
  const text = fs.readFileSync(path.resolve(file), "utf8").replace(/^﻿/, "");
  const batches = text.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter((b) => b && !/^(--.*|\/\*[\s\S]*?\*\/|\s)*$/.test(b));
  let n = 0;
  for (const b of batches) {
    try {
      const r = await pool.request().batch(b);
      n++;
      for (const rs of r.recordsets ?? []) if (rs.length) console.log(JSON.stringify(rs));
    } catch (e) {
      console.log(`HATA batch ${n + 1}: ${e.message}\n${b.slice(0, 300)}`);
      process.exitCode = 1;
      break;
    }
  }
  console.log(`${n}/${batches.length} batch çalıştı.`);
  await pool.close();
})();
