// Supabase (PostgreSQL) → MSSQL veri aktarımı.
// Kullanım: node aktar.cjs <proje klasörü> [--dene] [--yeniden]
//  1) Canlı Supabase'den tek, tutarlı, SALT-OKUNUR anlık görüntü alır ve backups/ altına yazar.
//  2) MSSQL'e TEK transaction içinde yükler (kimlikler birebir korunur, tetikleyiciler yükleme sırasında kapalı).
//  3) Commit'ten önce her satırı alan alan, bakiyeleri müşteri müşteri ve toplamları karşılaştırır.
//     Tek fark varsa hepsi geri alınır.
//  --dene    : her şeyi yapar, doğrular, sonra bilerek geri alır.
//  --yeniden : MSSQL'de veri varsa önce siler (son geçiş günü yeniden aktarım için). Yoksa veri varken durur.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client, types } = require("pg");
const sql = require("mssql");

types.setTypeParser(1082, (v) => v); // date → "YYYY-MM-DD" (saat dilimi kayması olmasın)
types.setTypeParser(20, (v) => { // bigint kimlikler → sayı (int sınırını aşan olursa dur)
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n > 2147483647) throw new Error(`int sınırını aşan değer: ${v}`);
  return n;
});

const root = process.argv[2];
const DRY = process.argv.includes("--dene");
const AGAIN = process.argv.includes("--yeniden");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

// timestamptz → Türkiye saatiyle "YYYY-MM-DDTHH:MM:SS" (smalldatetime dakikaya yuvarlar)
const trFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const ts = (d) => (d == null ? null : trFmt.format(d instanceof Date ? d : new Date(d)).replace(" ", "T"));
const fail = (m) => { throw new Error(m); };

(async () => {
  // ---------------------------------------------------------------- 1) Anlık görüntü
  const pg = new Client({ connectionString: env.SUPABASE_DB_URL.replace("?sslmode=require", ""), ssl: { rejectUnauthorized: false } });
  await pg.connect();
  await pg.query("begin isolation level repeatable read read only");
  const T = {};
  for (const t of ["app_settings", "profiles", "customers", "product_categories", "products", "customer_products", "customer_prices",
    "drivers", "orders", "order_lines", "expense_categories", "expenses", "driver_days", "counter_days", "counter_sales", "audit_log"]) {
    T[t] = (await pg.query(`select * from public.${t}${t === "app_settings" ? "" : " order by 1"}`)).rows;
  }
  T.auth_users = (await pg.query("select id, email, encrypted_password, last_sign_in_at, created_at from auth.users order by created_at")).rows;
  const srcBalances = (await pg.query("select customer_id, sum(delta)::numeric(14,2) as balance from private.customer_moves group by customer_id")).rows;
  const snapAt = (await pg.query("select now() as t")).rows[0].t;
  await pg.query("commit");
  await pg.end();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const snapDir = path.join(root, "backups", `aktarim-${stamp}`);
  fs.mkdirSync(snapDir, { recursive: true });
  const snapBody = JSON.stringify({ alindi: snapAt, tablolar: T, bakiyeler: srcBalances });
  fs.writeFileSync(path.join(snapDir, "kaynak.json"), snapBody);
  console.log(`Anlık görüntü: ${snapDir} (${(snapBody.length / 1e6).toFixed(1)} MB, sha256 ${crypto.createHash("sha256").update(snapBody).digest("hex").slice(0, 16)}…)`);
  console.log("Kaynak satırlar:", Object.entries(T).map(([k, v]) => `${k}=${v.length}`).join(" "));

  // ---------------------------------------------------------------- 2) Dönüşüm
  const users = [...T.profiles].sort((a, b) => a.created_at - b.created_at);
  const uid = new Map(users.map((p, i) => [p.id, i + 1]));
  const U = (v) => (v == null ? null : uid.get(v) ?? null);
  const authById = new Map(T.auth_users.map((a) => [a.id, a]));
  const COLORS = { amber: 1, emerald: 2, sky: 3, violet: 4, rose: 5, orange: 6, teal: 7, indigo: 8, lime: 9, fuchsia: 10 };
  const PLACE = { general: 1, counter: 2, driver: 3 }, KIND = { expense: 1, payment: 2 }, PAY = { cash: 1, account: 2 };
  const ACT = { INSERT: 1, UPDATE: 2, DELETE: 3 };
  const key = (s) => String(s).trim().replace(/\s+/g, " ").toLocaleUpperCase("tr");
  const expCat = new Map(T.expense_categories.map((c) => [key(c.name), c.id]));

  // Her tablo: hedef adı, identity mi, kolonlar [ad, tip, tür], satırlar.
  // tür: "ts" zaman damgası (±1 dk tolerans), "d" gün, "n" sayı, "b" bit, "s" metin
  const D = (d) => (d == null ? null : `${d}T00:00:00`);
  const plan = [
    { t: "Users", id: true, cols: [["UserId", "int"], ["Email", "varchar(254)", "s"], ["FullName", "nvarchar(100)", "s"], ["PasswordHash", "varchar(100)", "s"],
      ["RoleId", "int"], ["IsActive", "bit", "b"], ["LastLoginAt", "smalldatetime", "ts"], ["CreatedAt", "smalldatetime", "ts"], ["UpdatedAt", "smalldatetime", "ts"]],
      rows: users.map((p) => {
        const a = authById.get(p.id) ?? fail(`auth kullanıcısı yok: ${p.id}`);
        return { UserId: uid.get(p.id), Email: a.email.trim().toLowerCase(), FullName: p.full_name, PasswordHash: a.encrypted_password || null,
          RoleId: p.role === "admin" ? 1 : 2, IsActive: p.is_active, LastLoginAt: ts(a.last_sign_in_at), CreatedAt: ts(p.created_at), UpdatedAt: ts(p.updated_at) };
      }) },
    { t: "Settings", id: false, cols: [["SettingsId", "int"], ["LockPastWeeks", "bit", "b"], ["CounterBreadPrice", "decimal(10,2)", "n"], ["UpdatedAt", "smalldatetime", "ts"]],
      rows: T.app_settings.map((s) => ({ SettingsId: 1, LockPastWeeks: s.lock_past_weeks, CounterBreadPrice: s.counter_bread_price, UpdatedAt: ts(s.updated_at) })) },
    { t: "Customers", id: true, cols: [["CustomerId", "int"], ["CustomerTypeId", "int"], ["Name", "nvarchar(120)", "s"], ["Address", "nvarchar(500)", "s"], ["Note", "nvarchar(1000)", "s"],
      ["BuysProducts", "bit", "b"], ["IsActive", "bit", "b"], ["CreatedAt", "smalldatetime", "ts"], ["CreatedBy", "int"], ["UpdatedAt", "smalldatetime", "ts"]],
      rows: T.customers.map((c) => ({ CustomerId: c.id, CustomerTypeId: c.type, Name: c.name, Address: c.address, Note: c.note, BuysProducts: c.buys_products,
        IsActive: c.is_active, CreatedAt: ts(c.created_at), CreatedBy: U(c.created_by), UpdatedAt: ts(c.updated_at) })) },
    { t: "ProductCategories", id: true, cols: [["CategoryId", "int"], ["Name", "nvarchar(40)", "s"], ["IsBread", "bit", "b"], ["ColorId", "int"], ["SortOrder", "int"], ["CreatedAt", "smalldatetime", "ts"]],
      rows: T.product_categories.map((c) => ({ CategoryId: c.id, Name: c.name, IsBread: c.is_bread, ColorId: COLORS[c.color] ?? fail(`renk ${c.color}`), SortOrder: c.sort_order, CreatedAt: ts(c.created_at) })) },
    { t: "Products", id: true, cols: [["ProductId", "int"], ["CategoryId", "int"], ["Name", "nvarchar(60)", "s"], ["Unit", "nvarchar(12)", "s"], ["SuggestedPrice", "decimal(10,2)", "n"],
      ["IsActive", "bit", "b"], ["SortOrder", "int"], ["CreatedAt", "smalldatetime", "ts"]],
      rows: T.products.map((p) => ({ ProductId: p.id, CategoryId: p.category_id, Name: p.name, Unit: p.unit, SuggestedPrice: p.suggested_price, IsActive: p.is_active, SortOrder: p.sort_order, CreatedAt: ts(p.created_at) })) },
    { t: "CustomerProducts", id: true, cols: [["CustomerProductId", "int"], ["CustomerId", "int"], ["ProductId", "int"], ["IsActive", "bit", "b"], ["CreatedAt", "smalldatetime", "ts"]],
      rows: T.customer_products.map((x) => ({ CustomerProductId: x.id, CustomerId: x.customer_id, ProductId: x.product_id, IsActive: x.is_active, CreatedAt: ts(x.created_at) })) },
    { t: "CustomerPrices", id: true, cols: [["CustomerPriceId", "int"], ["CustomerId", "int"], ["ProductId", "int"], ["Price", "decimal(10,2)", "n"], ["ValidFrom", "smalldatetime", "d"],
      ["CreatedAt", "smalldatetime", "ts"], ["CreatedBy", "int"]],
      rows: T.customer_prices.map((x) => ({ CustomerPriceId: x.id, CustomerId: x.customer_id, ProductId: x.product_id, Price: x.price, ValidFrom: D(x.valid_from), CreatedAt: ts(x.created_at), CreatedBy: U(x.created_by) })) },
    { t: "Drivers", id: true, cols: [["DriverId", "int"], ["Name", "nvarchar(60)", "s"], ["IsOwner", "bit", "b"], ["IsActive", "bit", "b"], ["SortOrder", "int"], ["CreatedAt", "smalldatetime", "ts"]],
      rows: T.drivers.map((d) => ({ DriverId: d.id, Name: d.name, IsOwner: d.is_owner, IsActive: d.is_active, SortOrder: d.sort_order, CreatedAt: ts(d.created_at) })) },
    { t: "Orders", id: true, cols: [["OrderId", "int"], ["CustomerId", "int"], ["DriverId", "int"], ["EntryDate", "smalldatetime", "d"], ["SortOrder", "int"],
      ["DeliveredQty", "int"], ["ReturnedQty", "int"], ["GrossAmount", "decimal(14,2)", "n"], ["ReturnAmount", "decimal(14,2)", "n"], ["NetAmount", "decimal(14,2)", "n"],
      ["Collection", "decimal(12,2)", "n"], ["Note", "nvarchar(500)", "s"], ["CreatedAt", "smalldatetime", "ts"], ["CreatedBy", "int"], ["UpdatedAt", "smalldatetime", "ts"], ["UpdatedBy", "int"]],
      rows: T.orders.map((o) => ({ OrderId: o.id, CustomerId: o.customer_id, DriverId: o.driver_id, EntryDate: D(o.entry_date), SortOrder: o.sort_order,
        DeliveredQty: o.delivered_qty, ReturnedQty: o.returned_qty, GrossAmount: o.gross_amount, ReturnAmount: o.return_amount, NetAmount: o.net_amount,
        Collection: o.collection, Note: o.note, CreatedAt: ts(o.created_at), CreatedBy: U(o.created_by), UpdatedAt: ts(o.updated_at), UpdatedBy: U(o.updated_by) })) },
    { t: "OrderLines", id: true, cols: [["OrderLineId", "int"], ["OrderId", "int"], ["ProductId", "int"], ["DeliveredQty", "int"], ["ReturnedQty", "int"], ["UnitPrice", "decimal(10,2)", "n"],
      ["CreatedAt", "smalldatetime", "ts"], ["UpdatedAt", "smalldatetime", "ts"]],
      rows: T.order_lines.map((l) => ({ OrderLineId: l.id, OrderId: l.order_id, ProductId: l.product_id, DeliveredQty: l.delivered_qty, ReturnedQty: l.returned_qty, UnitPrice: l.unit_price,
        CreatedAt: ts(l.created_at), UpdatedAt: ts(l.updated_at) })) },
    { t: "DriverDays", id: true, cols: [["DriverDayId", "int"], ["EntryDate", "smalldatetime", "d"], ["DriverId", "int"], ["HandedOver", "decimal(12,2)", "n"], ["Note", "nvarchar(500)", "s"], ["UpdatedAt", "smalldatetime", "ts"]],
      rows: T.driver_days.map((x) => ({ DriverDayId: x.id, EntryDate: D(x.entry_date), DriverId: x.driver_id, HandedOver: x.handed_over, Note: x.note, UpdatedAt: ts(x.updated_at) })) },
    { t: "CounterDays", id: true, cols: [["CounterDayId", "int"], ["EntryDate", "smalldatetime", "d"], ["SalesIncome", "decimal(12,2)", "n"], ["OpeningCash", "decimal(12,2)", "n"],
      ["ClosingCash", "decimal(12,2)", "n"], ["HandedOver", "decimal(12,2)", "n"], ["BreadsIn", "int"], ["BreadsLeft", "int"], ["BreadPrice", "decimal(10,2)", "n"],
      ["Note", "nvarchar(500)", "s"], ["UpdatedAt", "smalldatetime", "ts"], ["UpdatedBy", "int"]],
      rows: T.counter_days.map((x) => ({ CounterDayId: x.id, EntryDate: D(x.entry_date), SalesIncome: x.sales_income, OpeningCash: x.opening_cash, ClosingCash: x.closing_cash,
        HandedOver: x.handed_over, BreadsIn: x.breads_in, BreadsLeft: x.breads_left, BreadPrice: x.bread_price, Note: x.note, UpdatedAt: ts(x.updated_at), UpdatedBy: U(x.updated_by) })) },
    { t: "CounterSales", id: true, cols: [["CounterSaleId", "int"], ["EntryDate", "smalldatetime", "d"], ["ProductId", "int"], ["Name", "nvarchar(60)", "s"], ["Qty", "decimal(10,2)", "n"],
      ["UnitPrice", "decimal(12,2)", "n"], ["CreatedAt", "smalldatetime", "ts"], ["CreatedBy", "int"], ["UpdatedAt", "smalldatetime", "ts"]],
      rows: T.counter_sales.map((x) => ({ CounterSaleId: x.id, EntryDate: D(x.entry_date), ProductId: x.product_id, Name: x.name, Qty: x.qty, UnitPrice: x.unit_price,
        CreatedAt: ts(x.created_at), CreatedBy: U(x.created_by), UpdatedAt: ts(x.updated_at) })) },
    { t: "ExpenseCategories", id: true, cols: [["ExpenseCategoryId", "int"], ["Name", "nvarchar(40)", "s"], ["SortOrder", "int"], ["IsActive", "bit", "b"], ["CreatedAt", "smalldatetime", "ts"]],
      rows: T.expense_categories.map((c) => ({ ExpenseCategoryId: c.id, Name: c.name, SortOrder: c.sort_order, IsActive: true, CreatedAt: ts(c.created_at) })) },
    { t: "Expenses", id: true, cols: [["ExpenseId", "int"], ["EntryDate", "smalldatetime", "d"], ["ExpensePlaceId", "int"], ["DriverId", "int"], ["CustomerId", "int"], ["ExpenseKindId", "int"],
      ["PaymentMethodId", "int"], ["ExpenseCategoryId", "int"], ["Amount", "decimal(12,2)", "n"], ["Description", "nvarchar(200)", "s"],
      ["CreatedAt", "smalldatetime", "ts"], ["CreatedBy", "int"], ["UpdatedAt", "smalldatetime", "ts"]],
      rows: T.expenses.map((e) => ({ ExpenseId: e.id, EntryDate: D(e.entry_date), ExpensePlaceId: PLACE[e.place] ?? fail(`yer ${e.place}`), DriverId: e.driver_id, CustomerId: e.customer_id,
        ExpenseKindId: KIND[e.kind] ?? fail(`tür ${e.kind}`), PaymentMethodId: PAY[e.payment] ?? fail(`ödeme ${e.payment}`),
        ExpenseCategoryId: e.category == null || String(e.category).trim() === "" ? null : (expCat.get(key(e.category)) ?? fail(`gider türü eşleşmedi: ${e.category}`)),
        Amount: e.amount, Description: e.description, CreatedAt: ts(e.created_at), CreatedBy: U(e.created_by), UpdatedAt: ts(e.updated_at) })) },
    { t: "AuditLog", id: true, cols: [["AuditLogId", "int"], ["TableName", "varchar(64)", "s"], ["RecordId", "varchar(40)", "s"], ["AuditActionId", "int"],
      ["OldData", "nvarchar(max)", "s"], ["NewData", "nvarchar(max)", "s"], ["ChangedBy", "int"], ["ChangedAt", "smalldatetime", "ts"]],
      rows: T.audit_log.map((a) => ({ AuditLogId: a.id, TableName: a.table_name, RecordId: a.record_id, AuditActionId: ACT[a.action] ?? fail(`işlem ${a.action}`),
        OldData: a.old_data == null ? null : JSON.stringify(a.old_data), NewData: a.new_data == null ? null : JSON.stringify(a.new_data),
        ChangedBy: U(a.changed_by), ChangedAt: ts(a.changed_at) })) },
  ];

  // ---------------------------------------------------------------- 3) MSSQL'e yükleme
  const pool = await sql.connect({
    server: env.MSSQL_SERVER, port: Number(env.MSSQL_PORT), database: env.MSSQL_DATABASE, user: env.MSSQL_USER, password: env.MSSQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true, useUTC: true }, requestTimeout: 300000,
  });
  const dataTables = plan.map((p) => p.t);
  const existing = (await pool.request().query(
    `select n = ${dataTables.map((t) => `(select count(*) from dbo.${t})`).join(" + ")}`)).recordset[0].n;
  if (existing > 0 && !AGAIN) {
    console.log(`DURDU: MSSQL'de ${existing} veri satırı var. Yeniden aktarım için --yeniden kullanın.`);
    await pool.close();
    process.exit(2);
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  const q = (text) => new sql.Request(tx).batch(text);
  const problems = [];
  try {
    for (const t of dataTables) await q(`DISABLE TRIGGER ALL ON dbo.${t};`);
    if (existing > 0) {
      for (const t of [...dataTables].reverse()) await q(`DELETE dbo.${t};`);
      console.log(`Önceki ${existing} veri satırı silindi (--yeniden).`);
    }

    for (const p of plan) {
      if (!p.rows.length) { console.log(`${p.t.padEnd(18)}      0`); continue; }
      const names = p.cols.map((c) => `[${c[0]}]`).join(", ");
      const withs = p.cols.map((c) => `[${c[0]}] ${c[1]} '$.${c[0]}'`).join(", ");
      const r = new sql.Request(tx);
      r.input("j", sql.NVarChar(sql.MAX), JSON.stringify(p.rows));
      await r.batch(`${p.id ? `SET IDENTITY_INSERT dbo.${p.t} ON;` : ""}
        INSERT dbo.${p.t} (${names}) SELECT ${names} FROM OPENJSON(@j) WITH (${withs});
        ${p.id ? `SET IDENTITY_INSERT dbo.${p.t} OFF;` : ""}`);
      console.log(`${p.t.padEnd(18)} ${String(p.rows.length).padStart(6)}`);
    }

    for (const t of dataTables) await q(`ENABLE TRIGGER ALL ON dbo.${t};`);

    // ------------------------------------------------------------ 4) Doğrulama (commit öncesi)
    const norm = (v, kind) => {
      if (v == null) return null;
      if (kind === "n") return Number(v).toFixed(2);
      if (kind === "b") return Boolean(v);
      if (kind === "d") return (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
      if (kind === "ts") return Date.parse((v instanceof Date ? v.toISOString() : String(v)).slice(0, 19) + "Z");
      return typeof v === "number" ? v : String(v);
    };
    for (const p of plan) {
      const pk = p.cols[0][0];
      const got = (await q(`SELECT ${p.cols.map((c) => `[${c[0]}]`).join(", ")} FROM dbo.${p.t} ORDER BY [${pk}]`)).recordset;
      if (got.length !== p.rows.length) { problems.push(`${p.t}: satır ${got.length} ≠ kaynak ${p.rows.length}`); continue; }
      const exp = [...p.rows].sort((a, b) => a[pk] - b[pk]);
      let diffs = 0;
      for (let i = 0; i < exp.length; i++) {
        for (const [c, , kind] of p.cols) {
          const a = norm(exp[i][c], kind), b = norm(got[i][c], kind);
          const same = kind === "ts" ? (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= 60000) : a === b;
          if (!same && diffs++ < 5) problems.push(`${p.t}#${exp[i][pk]}.${c}: kaynak ${JSON.stringify(exp[i][c])} ≠ hedef ${JSON.stringify(got[i][c])}`);
        }
      }
      if (diffs > 5) problems.push(`${p.t}: toplam ${diffs} alan farkı`);
    }

    // Hesaplanan sütunlar kaynaktaki değerlerle aynı mı?
    const ob = (await q("SELECT OrderId, BalanceDelta FROM dbo.Orders")).recordset;
    const srcOb = new Map(T.orders.map((o) => [o.id, Number(o.balance_delta).toFixed(2)]));
    for (const o of ob) if (Number(o.BalanceDelta).toFixed(2) !== srcOb.get(o.OrderId)) problems.push(`Orders#${o.OrderId} BalanceDelta ${o.BalanceDelta} ≠ ${srcOb.get(o.OrderId)}`);
    const lb = (await q("SELECT OrderLineId, GrossAmount, ReturnAmount, NetAmount FROM dbo.OrderLines")).recordset;
    const srcLb = new Map(T.order_lines.map((l) => [l.id, l]));
    for (const l of lb) {
      const s = srcLb.get(l.OrderLineId);
      for (const [a, b] of [["GrossAmount", "gross_amount"], ["ReturnAmount", "return_amount"], ["NetAmount", "net_amount"]])
        if (Number(l[a]).toFixed(2) !== Number(s[b]).toFixed(2)) problems.push(`OrderLines#${l.OrderLineId}.${a} ${l[a]} ≠ ${s[b]}`);
    }

    // Müşteri bazında bakiye: kaynağın kendi view'ı (private.customer_moves) ile.
    const bal = new Map((await q("SELECT CustomerId, Balance FROM dbo.vw_CustomerBalances")).recordset.map((r) => [r.CustomerId, Number(r.Balance).toFixed(2)]));
    for (const c of T.customers) {
      const s = Number(srcBalances.find((b) => b.customer_id === c.id)?.balance ?? 0).toFixed(2);
      if (bal.get(c.id) !== s) problems.push(`Bakiye müşteri#${c.id} ${c.name}: hedef ${bal.get(c.id)} ≠ kaynak ${s}`);
    }

    // Bütünlük denetimi ve genel toplamlar.
    const integ = (await q("EXEC dbo.sp_Admin_CheckIntegrity")).recordset;
    for (const r of integ) problems.push(`Bütünlük: ${r.Problem} #${r.RecordId}`);
    const tot = (await q(`SELECT
        Net = (SELECT SUM(NetAmount) FROM dbo.Orders), Tahsilat = (SELECT SUM(Collection) FROM dbo.Orders),
        Fark = (SELECT SUM(BalanceDelta) FROM dbo.Orders), Verilen = (SELECT SUM(DeliveredQty) FROM dbo.Orders),
        Iade = (SELECT SUM(ReturnedQty) FROM dbo.Orders), SatirNet = (SELECT SUM(NetAmount) FROM dbo.OrderLines),
        Gider = (SELECT SUM(Amount) FROM dbo.Expenses), Bakiye = (SELECT SUM(Balance) FROM dbo.vw_CustomerBalances),
        Tezgah = (SELECT ISNULL(SUM(SalesIncome), 0) FROM dbo.CounterDays)`)).recordset[0];
    const sum = (rows, f) => rows.reduce((a, r) => a + Number(r[f] ?? 0), 0).toFixed(2);
    const srcTot = { Net: sum(T.orders, "net_amount"), Tahsilat: sum(T.orders, "collection"), Fark: sum(T.orders, "balance_delta"),
      Verilen: sum(T.orders, "delivered_qty"), Iade: sum(T.orders, "returned_qty"), SatirNet: sum(T.order_lines, "net_amount"),
      Gider: sum(T.expenses, "amount"), Bakiye: sum(srcBalances, "balance"), Tezgah: sum(T.counter_days, "sales_income") };
    for (const k of Object.keys(srcTot)) {
      const ok = Number(tot[k]).toFixed(2) === srcTot[k];
      console.log(`  ${k.padEnd(9)} kaynak ${srcTot[k].padStart(14)}  hedef ${Number(tot[k]).toFixed(2).padStart(14)}  ${ok ? "✓" : "✗"}`);
      if (!ok) problems.push(`Toplam ${k}: ${tot[k]} ≠ ${srcTot[k]}`);
    }

    if (problems.length) throw new Error(`${problems.length} fark bulundu:\n  ` + problems.slice(0, 40).join("\n  "));

    fs.writeFileSync(path.join(snapDir, "dogrulama.json"), JSON.stringify({ kaynak: srcTot, hedef: tot, satirlar: Object.fromEntries(plan.map((p) => [p.t, p.rows.length])) }, null, 2));
    if (DRY) {
      await tx.rollback();
      console.log("KURU DENEME: bütün satırlar ve toplamlar birebir tuttu; hepsi geri alındı.");
    } else {
      await tx.commit();
      console.log("AKTARIM TAMAM: bütün satırlar ve toplamlar birebir tuttu; kalıcı yazıldı.");
    }
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.log("GERİ ALINDI:", e.message);
    process.exitCode = 1;
  }
  await pool.close();
})();
