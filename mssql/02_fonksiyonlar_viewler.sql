/* =============================================================================
   Ekmekçi — 02 · Fonksiyonlar ve view'lar
   Sorgularda satır başına çağrılan hesaplar inline TVF ya da ifade olarak yazıldı
   (SQL Server 2017'de skaler fonksiyonlar paralelliği ve satır tahminini bozar).
============================================================================= */
SET NOCOUNT ON;
GO

/* -----------------------------------------------------------------------------
   Tarih yardımcıları (Türkiye saati)
----------------------------------------------------------------------------- */

-- Şu an, Türkiye saatiyle.
CREATE OR ALTER FUNCTION dbo.fn_Now()
RETURNS smalldatetime
AS
BEGIN
    RETURN CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time');
END;
GO

-- Bugün, Türkiye saatiyle (saat 00:00).
CREATE OR ALTER FUNCTION dbo.fn_Today()
RETURNS smalldatetime
AS
BEGIN
    RETURN CONVERT(smalldatetime, CONVERT(date, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time'));
END;
GO

-- Haftanın pazartesisi. DATEFIRST ayarından bağımsız: 1900-01-01 pazartesidir.
CREATE OR ALTER FUNCTION dbo.fn_WeekStart(@Date smalldatetime)
RETURNS smalldatetime
WITH SCHEMABINDING
AS
BEGIN
    RETURN DATEADD(day, -(DATEDIFF(day, 0, @Date) % 7), CONVERT(smalldatetime, CONVERT(date, @Date)));
END;
GO

-- Geçmiş hafta kilidi açıksa ve tarih bu haftadan önceyse 1.
CREATE OR ALTER FUNCTION dbo.fn_IsLocked(@Date smalldatetime)
RETURNS bit
AS
BEGIN
    DECLARE @Lock bit = ISNULL((SELECT LockPastWeeks FROM dbo.Settings WHERE SettingsId = 1), 1);
    RETURN CASE WHEN @Lock = 1 AND @Date < dbo.fn_WeekStart(dbo.fn_Today()) THEN 1 ELSE 0 END;
END;
GO

-- Dönem başlangıcı: day / week / month / year (raporlarda satır başına kullanılır → inline).
CREATE OR ALTER FUNCTION dbo.tf_PeriodStart(@Date smalldatetime, @Group varchar(5))
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT PeriodStart = CASE @Group
        WHEN 'week'  THEN DATEADD(day, -(DATEDIFF(day, 0, @Date) % 7), CONVERT(smalldatetime, CONVERT(date, @Date)))
        WHEN 'month' THEN CONVERT(smalldatetime, DATEFROMPARTS(YEAR(@Date), MONTH(@Date), 1))
        WHEN 'year'  THEN CONVERT(smalldatetime, DATEFROMPARTS(YEAR(@Date), 1, 1))
        ELSE CONVERT(smalldatetime, CONVERT(date, @Date))
    END;
GO

-- Müşterinin bir ürün için belirli bir gündeki fiyatı (yoksa satır dönmez).
CREATE OR ALTER FUNCTION dbo.tf_PriceOn(@CustomerId int, @ProductId int, @Date smalldatetime)
RETURNS TABLE
AS
RETURN
    SELECT TOP (1) cp.Price
    FROM dbo.CustomerPrices cp
    WHERE cp.CustomerId = @CustomerId AND cp.ProductId = @ProductId AND cp.ValidFrom <= @Date
    ORDER BY cp.ValidFrom DESC;
GO

/* -----------------------------------------------------------------------------
   Müşteri hesap hareketleri: bakiyenin tek kaynağı.
     SourceId 1 = sipariş (satış − tahsilat), 2 = cari hareket (giderler)
----------------------------------------------------------------------------- */

CREATE OR ALTER VIEW dbo.vw_CustomerMoves
AS
SELECT o.CustomerId, o.EntryDate, Delta = o.BalanceDelta, SourceId = 1
FROM dbo.Orders o
UNION ALL
SELECT e.CustomerId, e.EntryDate,
       Delta = CASE WHEN e.ExpenseKindId = 2 THEN e.Amount ELSE -e.Amount END,
       SourceId = 2
FROM dbo.Expenses e
WHERE e.CustomerId IS NOT NULL AND (e.ExpenseKindId = 2 OR e.PaymentMethodId = 2);
GO

-- Müşteri başına güncel bakiye ve son sipariş günü.
CREATE OR ALTER VIEW dbo.vw_CustomerBalances
AS
SELECT c.CustomerId,
       Balance       = CONVERT(decimal(14, 2), ISNULL(m.Balance, 0)),
       LastEntryDate = m.LastEntryDate
FROM dbo.Customers c
OUTER APPLY (
    SELECT Balance = SUM(x.Delta),
           LastEntryDate = MAX(CASE WHEN x.SourceId = 1 THEN x.EntryDate END)
    FROM dbo.vw_CustomerMoves x
    WHERE x.CustomerId = c.CustomerId
) m;
GO

-- Müşterinin aktif ürünleri ve bugünkü fiyatları.
CREATE OR ALTER VIEW dbo.vw_CustomerCurrentPrices
AS
SELECT cpr.CustomerId, p.ProductId, ProductName = p.Name, p.Unit, p.SortOrder,
       cur.Price, Since = cur.ValidFrom
FROM dbo.CustomerProducts cpr
JOIN dbo.Products p ON p.ProductId = cpr.ProductId AND p.IsActive = 1
OUTER APPLY (
    SELECT TOP (1) cp.Price, cp.ValidFrom
    FROM dbo.CustomerPrices cp
    WHERE cp.CustomerId = cpr.CustomerId AND cp.ProductId = cpr.ProductId
      AND cp.ValidFrom <= CONVERT(smalldatetime, CONVERT(date, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time'))
    ORDER BY cp.ValidFrom DESC
) cur
WHERE cpr.IsActive = 1;
GO

-- Müşteri listesi: kart + bakiye + ürünler (JSON dizi).
CREATE OR ALTER VIEW dbo.vw_CustomerOverview
AS
SELECT c.CustomerId, c.CustomerTypeId, CustomerTypeName = t.Name, c.Name, c.Address, c.Note,
       c.BuysProducts, c.IsActive, c.CreatedAt,
       b.Balance, b.LastEntryDate,
       Products = ISNULL((
           SELECT pr.ProductId, Name = pr.ProductName, pr.Unit, pr.Price, pr.Since
           FROM dbo.vw_CustomerCurrentPrices pr
           WHERE pr.CustomerId = c.CustomerId
           ORDER BY pr.SortOrder, pr.ProductName
           FOR JSON PATH, INCLUDE_NULL_VALUES
       ), N'[]')
FROM dbo.Customers c
JOIN dbo.CustomerTypes t ON t.CustomerTypeId = c.CustomerTypeId
JOIN dbo.vw_CustomerBalances b ON b.CustomerId = c.CustomerId;
GO

-- Sipariş satırları, sipariş ve ürün bilgisiyle.
CREATE OR ALTER VIEW dbo.vw_OrderLineDetails
AS
SELECT l.OrderLineId, l.OrderId, o.CustomerId, o.DriverId, o.EntryDate,
       l.ProductId, ProductName = p.Name, ProductUnit = p.Unit, p.CategoryId,
       l.DeliveredQty, l.ReturnedQty, l.UnitPrice, l.GrossAmount, l.ReturnAmount, l.NetAmount
FROM dbo.OrderLines l
JOIN dbo.Orders o ON o.OrderId = l.OrderId
JOIN dbo.Products p ON p.ProductId = l.ProductId;
GO

-- Giderler, adlarıyla (Giderler sayfası).
CREATE OR ALTER VIEW dbo.vw_ExpenseDetails
AS
SELECT e.ExpenseId, e.EntryDate,
       e.ExpensePlaceId, PlaceCode = pl.Code, PlaceName = pl.Name,
       e.DriverId, DriverName = d.Name,
       e.CustomerId, CustomerName = c.Name,
       e.ExpenseKindId, KindCode = k.Code, KindName = k.Name,
       e.PaymentMethodId, PaymentCode = pm.Code, PaymentName = pm.Name,
       e.ExpenseCategoryId, CategoryName = ec.Name,
       e.Amount, e.Description, e.CreatedAt, e.CreatedBy
FROM dbo.Expenses e
JOIN dbo.ExpensePlaces pl ON pl.ExpensePlaceId = e.ExpensePlaceId
JOIN dbo.ExpenseKinds k ON k.ExpenseKindId = e.ExpenseKindId
JOIN dbo.PaymentMethods pm ON pm.PaymentMethodId = e.PaymentMethodId
LEFT JOIN dbo.Drivers d ON d.DriverId = e.DriverId
LEFT JOIN dbo.Customers c ON c.CustomerId = e.CustomerId
LEFT JOIN dbo.ExpenseCategories ec ON ec.ExpenseCategoryId = e.ExpenseCategoryId;
GO
