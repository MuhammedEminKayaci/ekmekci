// MSSQL şemasını kurar. Kullanım: node kur.cjs <proje klasörü> [--dene]
//  * Veritabanında kullanıcı tablosu varsa hiçbir şey yapmadan durur.
//  * Bütün dosyalar TEK transaction içinde çalışır; hata olursa hepsi geri alınır.
//  * --dene: her şeyi çalıştırır, sonra bilerek geri alır (kuru deneme).
const fs = require("fs");
const path = require("path");
const sql = require("mssql");

const root = process.argv[2];
const dryRun = process.argv.includes("--dene");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const files = ["01_tablolar.sql", "02_fonksiyonlar_viewler.sql", "03_tetikleyiciler.sql", "04_procedurler.sql"];

(async () => {
  const pool = await sql.connect({
    server: env.MSSQL_SERVER, port: Number(env.MSSQL_PORT), database: env.MSSQL_DATABASE,
    user: env.MSSQL_USER, password: env.MSSQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true }, requestTimeout: 120000,
  });
  const existing = (await pool.request().query("select count(*) as n from sys.objects where is_ms_shipped = 0")).recordset[0].n;
  if (existing > 0) {
    console.log(`DURDU: veritabanında ${existing} nesne var; kurulum yalnızca boş veritabanına yapılır.`);
    await pool.close();
    process.exit(2);
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  let n = 0;
  try {
    for (const f of files) {
      const text = fs.readFileSync(path.join(root, "mssql", f), "utf8").replace(/^﻿/, "");
      const batches = text.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter((b) => b && !/^(--.*|\/\*[\s\S]*?\*\/|\s)*$/.test(b));
      for (const b of batches) {
        try {
          await new sql.Request(tx).batch(b);
          n++;
        } catch (e) {
          throw new Error(`${f} · batch ${n + 1}: ${e.message}\n--- batch başı ---\n${b.slice(0, 400)}`);
        }
      }
      console.log(`${f}: tamam`);
    }
    const r = await new sql.Request(tx).query(`
      select tur = type_desc, adet = count(*) from sys.objects where is_ms_shipped = 0 group by type_desc order by type_desc;
      select tablo = t.name, satir = sum(p.rows) from sys.tables t join sys.partitions p on p.object_id = t.object_id and p.index_id in (0,1) group by t.name order by t.name;`);
    console.log("NESNELER", JSON.stringify(r.recordsets[0]));
    console.log("TABLOLAR", JSON.stringify(r.recordsets[1]));
    const testIdx = process.argv.indexOf("--test");
    if (dryRun && testIdx > 0) {
      const t = fs.readFileSync(path.join(root, process.argv[testIdx + 1]), "utf8").replace(/^﻿/, "");
      const [main, errPart] = t.split("--HATA-TESTI--");
      const tr = await new sql.Request(tx).batch(main);
      for (const rs of tr.recordsets) console.log("TEST", JSON.stringify(rs));
      if (errPart) {
        try {
          await new sql.Request(tx).batch(errPart);
          console.log("HATA TESTİ: hata bekleniyordu ama gelmedi!");
        } catch (e) {
          console.log("HATA TESTİ:", e.number, e.message);
        }
      }
    }
    if (dryRun) {
      await tx.rollback();
      console.log(`KURU DENEME BAŞARILI (${n} batch) — her şey geri alındı, veritabanı boş.`);
    } else {
      await tx.commit();
      console.log(`KURULUM TAMAM (${n} batch).`);
    }
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.log("HATA — hepsi geri alındı:", e.message);
    process.exitCode = 1;
  }
  await pool.close();
})();
