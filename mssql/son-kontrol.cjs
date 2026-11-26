// Aktarım sonrası bağımsız kontrol (yalnızca okuma).
const fs = require("fs"), path = require("path"), sql = require("mssql");
const root = process.argv[2];
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
(async () => {
  const pool = await sql.connect({ server: env.MSSQL_SERVER, port: +env.MSSQL_PORT, database: env.MSSQL_DATABASE, user: env.MSSQL_USER, password: env.MSSQL_PASSWORD, options: { encrypt: true, trustServerCertificate: true } });
  const r = await pool.request().query(`
    SELECT KapaliTetikleyici = COUNT(*) FROM sys.triggers WHERE is_disabled = 1;
    SELECT Tablo = t.name, Satir = SUM(p.rows), KimlikSayaci = IDENT_CURRENT('dbo.' + t.name)
      FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
      WHERE OBJECTPROPERTY(t.object_id, 'TableHasIdentity') = 1 GROUP BY t.name ORDER BY t.name;
    EXEC dbo.sp_Admin_CheckIntegrity;
    SELECT TOP (3) Name, Balance, LastEntryDate FROM dbo.vw_CustomerOverview ORDER BY Balance DESC;
    SELECT u.UserId, u.Email, u.FullName, Rol = r.Code, u.IsActive, SifreOzeti = LEFT(u.PasswordHash, 7) + '…' FROM dbo.Users u JOIN dbo.Roles r ON r.RoleId = u.RoleId;
    SELECT GuvenilmeyenFK = COUNT(*) FROM sys.foreign_keys WHERE is_not_trusted = 1 OR is_disabled = 1;
    SELECT GuvenilmeyenCHECK = COUNT(*) FROM sys.check_constraints WHERE is_not_trusted = 1 OR is_disabled = 1;`);
  r.recordsets.forEach((rs, i) => console.log(i, JSON.stringify(rs)));
  await pool.close();
})();
