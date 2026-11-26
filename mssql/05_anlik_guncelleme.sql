/* =============================================================================
   Ekmekçi — 05 · Anlık güncelleme (Change Tracking)
   Her yazımda artan veritabanı sürümü: CHANGE_TRACKING_CURRENT_VERSION().
   Uygulama açık sayfalara "veri değişti" bildirimini bu sayıya bakarak gönderir
   (sıra değişimi dahil her değişiklik). Bu dosya transaction DIŞINDA çalışır
   (ALTER DATABASE … SET CHANGE_TRACKING transaction içinde çalışmaz). Tekrar çalıştırılabilir.
============================================================================= */
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id = DB_ID())
    ALTER DATABASE CURRENT SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 1 DAYS, AUTO_CLEANUP = ON);
GO

DECLARE @t sysname, @sql nvarchar(400);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT t.name FROM sys.tables t
    WHERE t.name IN ('Users', 'Settings', 'Customers', 'CustomerProducts', 'CustomerPrices', 'ProductCategories', 'Products',
                     'Drivers', 'Orders', 'OrderLines', 'DriverDays', 'CounterDays', 'CounterSales', 'ExpenseCategories', 'Expenses')
      AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables c WHERE c.object_id = t.object_id);
OPEN cur;
FETCH NEXT FROM cur INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'ALTER TABLE dbo.' + QUOTENAME(@t) + N' ENABLE CHANGE_TRACKING';
    EXEC sys.sp_executesql @sql;
    FETCH NEXT FROM cur INTO @t;
END;
CLOSE cur;
DEALLOCATE cur;
GO

-- Veritabanının güncel veri sürümü (her yazımda artar).
CREATE OR ALTER PROCEDURE dbo.sp_Data_Version
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Version = CONVERT(bigint, ISNULL(CHANGE_TRACKING_CURRENT_VERSION(), 0));
END;
GO
