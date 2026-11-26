/* =============================================================================
   Ekmekçi — 03 · Tetikleyiciler
   * Sipariş toplamları: OrderLines her değiştiğinde Orders'taki adet/tutar alanları
     satırlardan yeniden toplanır (veri kim yazarsa yazsın tutarlı kalır).
   * Değişiklik kaydı: her tablo için AuditLog tetikleyicisi, tablonun kolonlarından
     sp_Admin_BuildAuditTriggers ile üretilir. İşlemi yapan kullanıcı
     SESSION_CONTEXT(N'UserId') değerinden okunur (procedure'lar bunu ayarlar).
============================================================================= */
SET NOCOUNT ON;
GO

CREATE OR ALTER TRIGGER dbo.trg_OrderLines_Totals
ON dbo.OrderLines
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    UPDATE o
       SET DeliveredQty = ISNULL(s.DeliveredQty, 0),
           ReturnedQty  = ISNULL(s.ReturnedQty, 0),
           GrossAmount  = ISNULL(s.GrossAmount, 0),
           ReturnAmount = ISNULL(s.ReturnAmount, 0),
           NetAmount    = ISNULL(s.NetAmount, 0),
           UpdatedAt    = CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time'),
           UpdatedBy    = CONVERT(int, SESSION_CONTEXT(N'UserId'))
      FROM dbo.Orders o
      JOIN (SELECT OrderId FROM inserted UNION SELECT OrderId FROM deleted) a ON a.OrderId = o.OrderId
     OUTER APPLY (
        SELECT DeliveredQty = SUM(l.DeliveredQty), ReturnedQty = SUM(l.ReturnedQty),
               GrossAmount = SUM(l.GrossAmount), ReturnAmount = SUM(l.ReturnAmount), NetAmount = SUM(l.NetAmount)
        FROM dbo.OrderLines l
        WHERE l.OrderId = o.OrderId
     ) s;
END;
GO

/* -----------------------------------------------------------------------------
   Değişiklik kaydı tetikleyicilerini üretir. Tabloya kolon eklenince yeniden çalıştırın:
     EXEC dbo.sp_Admin_BuildAuditTriggers;
   Yalnızca UpdatedAt / UpdatedBy / SortOrder değiştiyse kayıt tutulmaz.
----------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.sp_Admin_BuildAuditTriggers
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Tables TABLE (TableName sysname PRIMARY KEY, KeyColumn sysname NOT NULL);
    INSERT @Tables (TableName, KeyColumn) VALUES
        ('Users', 'UserId'), ('Settings', 'SettingsId'), ('Customers', 'CustomerId'),
        ('CustomerProducts', 'CustomerProductId'), ('CustomerPrices', 'CustomerPriceId'),
        ('ProductCategories', 'CategoryId'), ('Products', 'ProductId'), ('Drivers', 'DriverId'),
        ('Orders', 'OrderId'), ('OrderLines', 'OrderLineId'), ('DriverDays', 'DriverDayId'),
        ('CounterDays', 'CounterDayId'), ('CounterSales', 'CounterSaleId'),
        ('ExpenseCategories', 'ExpenseCategoryId'), ('Expenses', 'ExpenseId');

    DECLARE @t sysname, @k sysname, @cols nvarchar(max), @cmp_i nvarchar(max), @cmp_d nvarchar(max), @sql nvarchar(max);

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT TableName, KeyColumn FROM @Tables;
    OPEN cur;
    FETCH NEXT FROM cur INTO @t, @k;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Kayda yazılacak bütün kolonlar (şifre özeti hariç).
        SELECT @cols = STRING_AGG(CONVERT(nvarchar(max), QUOTENAME(c.name)), N', ') WITHIN GROUP (ORDER BY c.column_id)
        FROM sys.columns c
        WHERE c.object_id = OBJECT_ID(N'dbo.' + @t) AND c.name <> N'PasswordHash';

        -- Değişti mi karşılaştırması: zaman damgaları ve sıra hariç, karşılaştırılabilir tipler.
        SELECT @cmp_i = STRING_AGG(CONVERT(nvarchar(max), N'i.' + QUOTENAME(c.name)), N', ') WITHIN GROUP (ORDER BY c.column_id),
               @cmp_d = STRING_AGG(CONVERT(nvarchar(max), N'd.' + QUOTENAME(c.name)), N', ') WITHIN GROUP (ORDER BY c.column_id)
        FROM sys.columns c
        JOIN sys.types ty ON ty.user_type_id = c.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.' + @t)
          AND c.name NOT IN (N'UpdatedAt', N'UpdatedBy', N'SortOrder', N'LastLoginAt')
          AND NOT (ty.name IN (N'nvarchar', N'varchar') AND c.max_length = -1);

        SET @sql = N'
CREATE OR ALTER TRIGGER dbo.' + QUOTENAME(N'trg_' + @t + N'_Audit') + N'
ON dbo.' + QUOTENAME(@t) + N'
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
    INSERT dbo.AuditLog (TableName, RecordId, AuditActionId, OldData, NewData, ChangedBy)
    SELECT ' + QUOTENAME(@t, '''') + N',
           CONVERT(varchar(40), COALESCE(i.' + QUOTENAME(@k) + N', d.' + QUOTENAME(@k) + N')),
           CASE WHEN d.' + QUOTENAME(@k) + N' IS NULL THEN 1 WHEN i.' + QUOTENAME(@k) + N' IS NULL THEN 3 ELSE 2 END,
           (SELECT ' + @cols + N' FROM deleted x WHERE x.' + QUOTENAME(@k) + N' = d.' + QUOTENAME(@k) + N' FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
           (SELECT ' + @cols + N' FROM inserted x WHERE x.' + QUOTENAME(@k) + N' = i.' + QUOTENAME(@k) + N' FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
           CONVERT(int, SESSION_CONTEXT(N''UserId''))
    FROM inserted i
    FULL JOIN deleted d ON d.' + QUOTENAME(@k) + N' = i.' + QUOTENAME(@k) + N'
    WHERE i.' + QUOTENAME(@k) + N' IS NULL OR d.' + QUOTENAME(@k) + N' IS NULL
       OR EXISTS (SELECT ' + @cmp_i + N' EXCEPT SELECT ' + @cmp_d + N');
END;';
        EXEC sys.sp_executesql @sql;
        FETCH NEXT FROM cur INTO @t, @k;
    END;
    CLOSE cur;
    DEALLOCATE cur;
END;
GO

EXEC dbo.sp_Admin_BuildAuditTriggers;
GO
