/* =============================================================================
   Ekmekçi — 04 · Procedure'lar
   Uygulama tablolara doğrudan yazmaz; her işlem bir procedure'dür.

   Ortak kurallar
   * Yazan her procedure @UserId alır: kullanıcı aktif mi (yönetici işlerinde yönetici mi)
     denetlenir ve SESSION_CONTEXT'e yazılır (değişiklik kaydı kimin yaptığını bilir).
   * Geçmiş hafta kilidi (Settings.LockPastWeeks) her yazımda denetlenir.
   * Fiyat istemciden alınmaz; her zaman müşterinin o günkü fiyatından gelir.
   * Hatalar Türkçe mesajla THROW edilir:
       50001 geçersiz girdi · 50002 kayıt zaten var · 50003 yetki yok
       50004 kayıt bulunamadı · 50010 geçmiş hafta kilitli
============================================================================= */
SET NOCOUNT ON;
GO

/* -----------------------------------------------------------------------------
   Yardımcılar
----------------------------------------------------------------------------- */

-- İsim temizliği: baş/son boşluk, satır sonu ve sekme, çift boşluk. Boşsa NULL.
CREATE OR ALTER FUNCTION dbo.fn_CleanName(@Text nvarchar(4000))
RETURNS nvarchar(4000)
AS
BEGIN
    SET @Text = REPLACE(REPLACE(REPLACE(@Text, NCHAR(9), N' '), NCHAR(10), N' '), NCHAR(13), N' ');
    WHILE CHARINDEX(N'  ', @Text) > 0 SET @Text = REPLACE(@Text, N'  ', N' ');
    RETURN NULLIF(LTRIM(RTRIM(@Text)), N'');
END;
GO

-- Serbest metin (adres, not, açıklama): yalnızca baştaki ve sondaki boşluklar. Boşsa NULL.
CREATE OR ALTER FUNCTION dbo.fn_CleanText(@Text nvarchar(4000))
RETURNS nvarchar(4000)
AS
BEGIN
    RETURN NULLIF(LTRIM(RTRIM(REPLACE(REPLACE(@Text, NCHAR(13), N''), NCHAR(9), N' '))), N'');
END;
GO

-- @UserId aktif kullanıcı mı? @AdminOnly = 1 ise yönetici de olmalı. Değilse hata; değilse oturuma yazar.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_Begin
    @UserId int,
    @AdminOnly bit = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (
        SELECT 1 FROM dbo.Users u
        WHERE u.UserId = @UserId AND u.IsActive = 1 AND (@AdminOnly = 0 OR u.RoleId = 1)
    )
        THROW 50003, N'Bu işlem için yetkiniz yok.', 1;
    EXEC sys.sp_set_session_context @key = N'UserId', @value = @UserId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Lock_Assert
    @Date smalldatetime
AS
BEGIN
    SET NOCOUNT ON;
    IF dbo.fn_IsLocked(@Date) = 1
        THROW 50010, N'Geçmiş haftaların kayıtları değiştirilemez.', 1;
END;
GO

/* -----------------------------------------------------------------------------
   Kullanıcılar ve oturum
----------------------------------------------------------------------------- */

CREATE OR ALTER PROCEDURE dbo.sp_User_GetForLogin
    @Email varchar(254)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.UserId, u.Email, u.FullName, u.PasswordHash, u.RoleId, RoleCode = r.Code, u.IsActive
    FROM dbo.Users u
    JOIN dbo.Roles r ON r.RoleId = u.RoleId
    WHERE u.Email = LOWER(LTRIM(RTRIM(@Email)));
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_User_Get
    @UserId int
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.UserId, u.Email, u.FullName, u.RoleId, RoleCode = r.Code, u.IsActive,
           IsAdmin = CONVERT(bit, CASE WHEN u.RoleId = 1 AND u.IsActive = 1 THEN 1 ELSE 0 END)
    FROM dbo.Users u
    JOIN dbo.Roles r ON r.RoleId = u.RoleId
    WHERE u.UserId = @UserId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_User_RecordLogin
    @UserId int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users SET LastLoginAt = dbo.fn_Now() WHERE UserId = @UserId;
END;
GO

-- Yeni kullanıcı: ilk kullanıcı aktif yönetici olur, sonrakiler pasif kullanıcı başlar.
CREATE OR ALTER PROCEDURE dbo.sp_User_Create
    @Email varchar(254),
    @FullName nvarchar(100),
    @PasswordHash varchar(100),
    @UserId int OUTPUT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    SET @Email = LOWER(LTRIM(RTRIM(@Email)));
    IF @Email IS NULL OR @Email NOT LIKE '%_@_%' THROW 50001, N'Geçerli bir e-posta girin.', 1;
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @Email) THROW 50002, N'Bu e-posta ile bir kullanıcı zaten var.', 1;

    BEGIN TRAN;
    DECLARE @First bit = CASE WHEN EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)) THEN 0 ELSE 1 END;
    INSERT dbo.Users (Email, FullName, PasswordHash, RoleId, IsActive)
    VALUES (@Email, ISNULL(dbo.fn_CleanName(@FullName), LEFT(@Email, CHARINDEX('@', @Email) - 1)), @PasswordHash,
            CASE WHEN @First = 1 THEN 1 ELSE 2 END, @First);
    SET @UserId = SCOPE_IDENTITY();
    COMMIT;
END;
GO

/* -----------------------------------------------------------------------------
   Müşteriler
----------------------------------------------------------------------------- */

-- @Products: [{"productId": 1, "price": 45}]  (ürün almayan müşteride boş dizi)
CREATE OR ALTER PROCEDURE dbo.sp_Customer_Create
    @UserId int,
    @CustomerTypeId int,
    @Name nvarchar(200),
    @Address nvarchar(600) = NULL,
    @Note nvarchar(1100) = NULL,
    @BuysProducts bit = 1,
    @Products nvarchar(max) = N'[]',
    @CustomerId int OUTPUT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    EXEC dbo.sp_Auth_Begin @UserId;

    SET @Name = dbo.fn_CleanName(@Name);
    SET @Address = dbo.fn_CleanText(@Address);
    SET @Note = dbo.fn_CleanText(@Note);
    IF @Name IS NULL OR LEN(@Name) > 120 THROW 50001, N'Müşteri adı gerekli (en çok 120 karakter).', 1;
    IF LEN(@Address) > 500 OR LEN(@Note) > 1000 THROW 50001, N'Adres ya da not çok uzun.', 1;
    IF @CustomerTypeId NOT IN (1, 2) THROW 50001, N'Geçersiz müşteri türü.', 1;
    IF ISJSON(ISNULL(@Products, N'[]')) = 0 THROW 50001, N'Ürün listesi geçersiz.', 1;
    IF EXISTS (SELECT 1 FROM dbo.Customers WHERE Name = @Name) THROW 50002, N'Bu isimde bir müşteri zaten var.', 1;

    DECLARE @P TABLE (ProductId int PRIMARY KEY, Price decimal(10, 2) NOT NULL);
    IF ISNULL(@BuysProducts, 1) = 1
        INSERT @P (ProductId, Price)
        SELECT j.productId, j.price
        FROM OPENJSON(@Products) WITH (productId int '$.productId', price decimal(10, 2) '$.price') j;

    IF ISNULL(@BuysProducts, 1) = 1 AND NOT EXISTS (SELECT 1 FROM @P)
        THROW 50001, N'En az bir ürün seçin ya da “Ürün alır” tikini kaldırın.', 1;
    IF EXISTS (SELECT 1 FROM @P WHERE Price IS NULL OR Price <= 0 OR Price >= 100000)
        THROW 50001, N'Seçilen ürünlerin fiyatını girin.', 1;
    IF EXISTS (SELECT 1 FROM @P x LEFT JOIN dbo.Products p ON p.ProductId = x.ProductId AND p.IsActive = 1 WHERE p.ProductId IS NULL)
        THROW 50001, N'Seçilen ürünlerden biri bulunamadı ya da pasif.', 1;

    DECLARE @From smalldatetime = dbo.fn_WeekStart(dbo.fn_Today()); -- ilk fiyat bu haftanın başından geçerli

    BEGIN TRAN;
    INSERT dbo.Customers (CustomerTypeId, Name, Address, Note, BuysProducts, CreatedBy, UpdatedBy)
    VALUES (@CustomerTypeId, @Name, @Address, @Note, ISNULL(@BuysProducts, 1), @UserId, @UserId);
    SET @CustomerId = SCOPE_IDENTITY();

    INSERT dbo.CustomerProducts (CustomerId, ProductId) SELECT @CustomerId, ProductId FROM @P;
    INSERT dbo.CustomerPrices (CustomerId, ProductId, Price, ValidFrom, CreatedBy)
    SELECT @CustomerId, ProductId, Price, @From, @UserId FROM @P;
    COMMIT;
END;
GO

-- @BuysProducts NULL ise değiştirilmez.
CREATE OR ALTER PROCEDURE dbo.sp_Customer_Update
    @UserId int,
    @CustomerId int,
    @CustomerTypeId int,
    @Name nvarchar(200),
    @Address nvarchar(600) = NULL,
    @Note nvarchar(1100) = NULL,
    @BuysProducts bit = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    EXEC dbo.sp_Auth_Begin @UserId;

    SET @Name = dbo.fn_CleanName(@Name);
    SET @Address = dbo.fn_CleanText(@Address);
    SET @Note = dbo.fn_CleanText(@Note);
    IF @Name IS NULL OR LEN(@Name) > 120 THROW 50001, N'Müşteri adı gerekli (en çok 120 karakter).', 1;
    IF LEN(@Address) > 500 OR LEN(@Note) > 1000 THROW 50001, N'Adres ya da not çok uzun.', 1;
    IF @CustomerTypeId NOT IN (1, 2) THROW 50001, N'Geçersiz müşteri türü.', 1;
    IF EXISTS (SELECT 1 FROM dbo.Customers WHERE Name = @Name AND CustomerId <> @CustomerId)
        THROW 50002, N'Bu isimde bir müşteri zaten var.', 1;

    UPDATE dbo.Customers
       SET CustomerTypeId = @CustomerTypeId, Name = @Name, Address = @Address, Note = @Note,
           BuysProducts = ISNULL(@BuysProducts, BuysProducts),
           UpdatedAt = dbo.fn_Now(), UpdatedBy = @UserId
     WHERE CustomerId = @CustomerId;
    IF @@ROWCOUNT = 0 THROW 50004, N'Müşteri bulunamadı.', 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Customer_SetActive
    @UserId int,
    @CustomerId int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    UPDATE dbo.Customers SET IsActive = @IsActive, UpdatedAt = dbo.fn_Now(), UpdatedBy = @UserId WHERE CustomerId = @CustomerId;
    IF @@ROWCOUNT = 0 THROW 50004, N'Müşteri bulunamadı.', 1;
END;
GO

-- Müşteriye ürün ekler ya da ürünün fiyatını değiştirir (aynı gün tekrar girilirse günceller).
-- Kilitli olmayan ve etkilenen sipariş satırlarının fiyatı da yenilenir.
CREATE OR ALTER PROCEDURE dbo.sp_CustomerPrice_Set
    @UserId int,
    @CustomerId int,
    @ProductId int,
    @Price decimal(10, 2),
    @ValidFrom smalldatetime = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    EXEC dbo.sp_Auth_Begin @UserId;

    SET @ValidFrom = CONVERT(smalldatetime, CONVERT(date, ISNULL(@ValidFrom, dbo.fn_Today())));
    IF @Price IS NULL OR @Price <= 0 OR @Price >= 100000 THROW 50001, N'Geçerli bir fiyat girin.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE CustomerId = @CustomerId) THROW 50004, N'Müşteri bulunamadı.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Products WHERE ProductId = @ProductId) THROW 50001, N'Ürün seçin.', 1;

    -- Ürün müşteriye ilk kez ekleniyorsa fiyat bu haftanın başından geçerli olsun.
    IF NOT EXISTS (SELECT 1 FROM dbo.CustomerPrices WHERE CustomerId = @CustomerId AND ProductId = @ProductId)
       AND @ValidFrom > dbo.fn_WeekStart(dbo.fn_Today())
        SET @ValidFrom = dbo.fn_WeekStart(dbo.fn_Today());

    IF dbo.fn_IsLocked(@ValidFrom) = 1 THROW 50010, N'Fiyat geçmiş bir haftadan başlatılamaz.', 1;

    DECLARE @Boundary smalldatetime =
        CASE WHEN ISNULL((SELECT LockPastWeeks FROM dbo.Settings WHERE SettingsId = 1), 1) = 1
             THEN dbo.fn_WeekStart(dbo.fn_Today()) ELSE '19000101' END;

    BEGIN TRAN;
    UPDATE dbo.CustomerProducts SET IsActive = 1 WHERE CustomerId = @CustomerId AND ProductId = @ProductId AND IsActive = 0;
    IF NOT EXISTS (SELECT 1 FROM dbo.CustomerProducts WHERE CustomerId = @CustomerId AND ProductId = @ProductId)
        INSERT dbo.CustomerProducts (CustomerId, ProductId) VALUES (@CustomerId, @ProductId);

    UPDATE dbo.CustomerPrices SET Price = @Price
     WHERE CustomerId = @CustomerId AND ProductId = @ProductId AND ValidFrom = @ValidFrom;
    IF @@ROWCOUNT = 0
        INSERT dbo.CustomerPrices (CustomerId, ProductId, Price, ValidFrom, CreatedBy)
        VALUES (@CustomerId, @ProductId, @Price, @ValidFrom, @UserId);

    -- Bu tarihten sonraki, kilitli olmayan satırlar yeni fiyat geçmişine göre.
    UPDATE l
       SET UnitPrice = p.Price, UpdatedAt = dbo.fn_Now()
      FROM dbo.OrderLines l
      JOIN dbo.Orders o ON o.OrderId = l.OrderId
     CROSS APPLY dbo.tf_PriceOn(o.CustomerId, l.ProductId, o.EntryDate) p
     WHERE o.CustomerId = @CustomerId AND l.ProductId = @ProductId
       AND o.EntryDate >= @ValidFrom AND o.EntryDate >= @Boundary
       AND l.UnitPrice <> p.Price;
    COMMIT;
END;
GO

-- Ürünü müşterinin listesinden çıkarır (geçmiş satışlar ve fiyat geçmişi korunur).
CREATE OR ALTER PROCEDURE dbo.sp_CustomerProduct_Remove
    @UserId int,
    @CustomerId int,
    @ProductId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    UPDATE dbo.CustomerProducts SET IsActive = 0 WHERE CustomerId = @CustomerId AND ProductId = @ProductId;
    IF @@ROWCOUNT = 0 THROW 50004, N'Ürün bu müşteride bulunamadı.', 1;
END;
GO

-- Hesap dökümü: gün / hafta / ay / yıl gruplu, yürüyen bakiyeli (en eski üstte).
CREATE OR ALTER PROCEDURE dbo.sp_Customer_Statement
    @CustomerId int,
    @From smalldatetime,
    @To smalldatetime,
    @Group varchar(5) = 'day'
AS
BEGIN
    SET NOCOUNT ON;
    IF @Group NOT IN ('day', 'week', 'month', 'year') THROW 50001, N'Geçersiz gruplama.', 1;

    DECLARE @Opening decimal(14, 2) = ISNULL((
        SELECT SUM(m.Delta) FROM dbo.vw_CustomerMoves m WHERE m.CustomerId = @CustomerId AND m.EntryDate < @From), 0);

    WITH x AS (
        SELECT ps.PeriodStart, o.DeliveredQty, o.ReturnedQty, o.GrossAmount, o.ReturnAmount, o.NetAmount, o.Collection,
               AccountDelta = CONVERT(decimal(14, 2), 0), Delta = o.BalanceDelta
        FROM dbo.Orders o
        CROSS APPLY dbo.tf_PeriodStart(o.EntryDate, @Group) ps
        WHERE o.CustomerId = @CustomerId AND o.EntryDate BETWEEN @From AND @To
        UNION ALL
        SELECT ps.PeriodStart, 0, 0, 0, 0, 0, 0, m.Delta, m.Delta
        FROM dbo.vw_CustomerMoves m
        CROSS APPLY dbo.tf_PeriodStart(m.EntryDate, @Group) ps
        WHERE m.CustomerId = @CustomerId AND m.SourceId = 2 AND m.EntryDate BETWEEN @From AND @To
    ), g AS (
        SELECT PeriodStart,
               DeliveredQty = SUM(DeliveredQty), ReturnedQty = SUM(ReturnedQty),
               GrossAmount = SUM(GrossAmount), ReturnAmount = SUM(ReturnAmount), NetAmount = SUM(NetAmount),
               Collection = SUM(Collection), AccountDelta = SUM(AccountDelta), PeriodDelta = SUM(Delta)
        FROM x
        GROUP BY PeriodStart
    )
    SELECT PeriodStart, DeliveredQty, ReturnedQty, GrossAmount, ReturnAmount, NetAmount, Collection, AccountDelta, PeriodDelta,
           RunningBalance = @Opening + SUM(PeriodDelta) OVER (ORDER BY PeriodStart ROWS UNBOUNDED PRECEDING)
    FROM g
    ORDER BY PeriodStart;
END;
GO

/* -----------------------------------------------------------------------------
   Ürünler ve türler (yalnızca yönetici)
----------------------------------------------------------------------------- */

-- @ProductId NULL ise yeni ürün.
CREATE OR ALTER PROCEDURE dbo.sp_Product_Save
    @UserId int,
    @ProductId int = NULL,
    @CategoryId int,
    @Name nvarchar(100),
    @Unit nvarchar(20) = N'adet',
    @SuggestedPrice decimal(10, 2) = NULL,
    @SavedProductId int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    EXEC dbo.sp_Auth_Begin @UserId, @AdminOnly = 1;

    SET @Name = dbo.fn_CleanName(@Name);
    SET @Unit = ISNULL(dbo.fn_CleanName(@Unit), N'adet');
    IF @Name IS NULL OR LEN(@Name) > 60 OR LEN(@Unit) > 12 OR (@SuggestedPrice IS NOT NULL AND (@SuggestedPrice <= 0 OR @SuggestedPrice >= 100000))
        THROW 50001, N'Ürün adı ve türü gerekli; birim ve öneri fiyatı geçerli olmalı.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.ProductCategories WHERE CategoryId = @CategoryId) THROW 50001, N'Ürün türü seçin.', 1;
    IF EXISTS (SELECT 1 FROM dbo.Products WHERE Name = @Name AND ProductId <> ISNULL(@ProductId, 0))
        THROW 50002, N'Bu isimde bir ürün zaten var.', 1;

    IF @ProductId IS NULL
    BEGIN
        INSERT dbo.Products (CategoryId, Name, Unit, SuggestedPrice, SortOrder)
        VALUES (@CategoryId, @Name, @Unit, @SuggestedPrice, ISNULL((SELECT MAX(SortOrder) FROM dbo.Products), 0) + 1);
        SET @SavedProductId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.Products SET CategoryId = @CategoryId, Name = @Name, Unit = @Unit, SuggestedPrice = @SuggestedPrice
         WHERE ProductId = @ProductId;
        IF @@ROWCOUNT = 0 THROW 50004, N'Ürün bulunamadı.', 1;
        SET @SavedProductId = @ProductId;
    END;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Product_SetActive
    @UserId int,
    @ProductId int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId, @AdminOnly = 1;
    UPDATE dbo.Products SET IsActive = @IsActive WHERE ProductId = @ProductId;
    IF @@ROWCOUNT = 0 THROW 50004, N'Ürün bulunamadı.', 1;
END;
GO

-- @CategoryId NULL ise yeni tür.
CREATE OR ALTER PROCEDURE dbo.sp_Category_Save
    @UserId int,
    @CategoryId int = NULL,
    @Name nvarchar(80),
    @IsBread bit,
    @ColorId int,
    @SavedCategoryId int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId, @AdminOnly = 1;

    SET @Name = dbo.fn_CleanName(@Name);
    IF @Name IS NULL OR LEN(@Name) > 40 OR @IsBread IS NULL THROW 50001, N'Tür adını yazın.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Colors WHERE ColorId = @ColorId) THROW 50001, N'Renk seçin.', 1;
    IF EXISTS (SELECT 1 FROM dbo.ProductCategories WHERE Name = @Name AND CategoryId <> ISNULL(@CategoryId, 0))
        THROW 50002, N'Bu isimde bir tür zaten var.', 1;

    IF @CategoryId IS NULL
    BEGIN
        INSERT dbo.ProductCategories (Name, IsBread, ColorId, SortOrder)
        VALUES (@Name, @IsBread, @ColorId, ISNULL((SELECT MAX(SortOrder) FROM dbo.ProductCategories), 0) + 1);
        SET @SavedCategoryId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.ProductCategories SET Name = @Name, IsBread = @IsBread, ColorId = @ColorId WHERE CategoryId = @CategoryId;
        IF @@ROWCOUNT = 0 THROW 50004, N'Tür bulunamadı.', 1;
        SET @SavedCategoryId = @CategoryId;
    END;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Category_Delete
    @UserId int,
    @CategoryId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId, @AdminOnly = 1;
    IF EXISTS (SELECT 1 FROM dbo.Products WHERE CategoryId = @CategoryId)
        THROW 50001, N'Bu türde ürünler var; önce ürünleri başka türe taşıyın.', 1;
    DELETE dbo.ProductCategories WHERE CategoryId = @CategoryId;
    IF @@ROWCOUNT = 0 THROW 50004, N'Tür bulunamadı.', 1;
END;
GO

/* -----------------------------------------------------------------------------
   Siparişler
----------------------------------------------------------------------------- */

-- Dağıtıcı verilmezse işletme sahibinin kendi dağıtımı.
CREATE OR ALTER FUNCTION dbo.fn_ResolveDriver(@DriverId int)
RETURNS int
AS
BEGIN
    RETURN ISNULL(@DriverId, (SELECT DriverId FROM dbo.Drivers WHERE IsOwner = 1));
END;
GO

-- Seçilen müşterileri dağıtıcının gün listesinin sonuna ekler (zaten listede olanlar yerinde kalır).
-- Yeni eklenen her müşteriye aldığı ürünlerin satırları hazır gelir.
-- @CustomerIds: [12, 7, 33]  (dizi sırası = liste sırası)
CREATE OR ALTER PROCEDURE dbo.sp_Order_AddCustomers
    @UserId int,
    @Date smalldatetime,
    @DriverId int = NULL,
    @CustomerIds nvarchar(max),
    @Added int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    EXEC dbo.sp_Auth_Begin @UserId;

    SET @Date = CONVERT(smalldatetime, CONVERT(date, @Date));
    SET @DriverId = dbo.fn_ResolveDriver(@DriverId);
    EXEC dbo.sp_Lock_Assert @Date;
    IF @DriverId IS NULL THROW 50004, N'Dağıtıcı bulunamadı.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Drivers WHERE DriverId = @DriverId AND IsActive = 1)
        THROW 50001, N'Pasif dağıtıcıya kayıt girilemez.', 1;
    IF ISJSON(@CustomerIds) = 0 THROW 50001, N'Geçersiz istek.', 1;

    DECLARE @Ids TABLE (CustomerId int PRIMARY KEY, Ord int NOT NULL);
    INSERT @Ids (CustomerId, Ord)
    SELECT CustomerId, MIN(Ord)
    FROM (SELECT CustomerId = TRY_CONVERT(int, j.[value]), Ord = CONVERT(int, j.[key]) FROM OPENJSON(@CustomerIds) j) s
    WHERE CustomerId IS NOT NULL
    GROUP BY CustomerId;
    IF NOT EXISTS (SELECT 1 FROM @Ids) THROW 50001, N'En az bir müşteri seçin.', 1;

    DECLARE @Bad nvarchar(200) = (
        SELECT TOP (1) ISNULL(c.Name, N'?') FROM @Ids i LEFT JOIN dbo.Customers c ON c.CustomerId = i.CustomerId
        WHERE c.CustomerId IS NULL OR c.IsActive = 0 OR c.BuysProducts = 0);
    IF @Bad IS NOT NULL
    BEGIN
        DECLARE @Msg nvarchar(400) = @Bad + N': pasif ya da ürün almayan müşteri siparişe eklenemez.';
        THROW 50001, @Msg, 1;
    END;

    -- Eklenecek her müşterinin aktif ürünlerinin bu güne fiyatı olmalı.
    DECLARE @NoPrice nvarchar(200) = (
        SELECT TOP (1) c.Name + N' / ' + pr.Name
        FROM @Ids i
        JOIN dbo.Customers c ON c.CustomerId = i.CustomerId
        JOIN dbo.CustomerProducts cp ON cp.CustomerId = i.CustomerId AND cp.IsActive = 1
        JOIN dbo.Products pr ON pr.ProductId = cp.ProductId AND pr.IsActive = 1
        WHERE NOT EXISTS (SELECT 1 FROM dbo.tf_PriceOn(i.CustomerId, cp.ProductId, @Date))
          AND NOT EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.CustomerId = i.CustomerId AND o.EntryDate = @Date AND o.DriverId = @DriverId));
    IF @NoPrice IS NOT NULL
    BEGIN
        DECLARE @Msg2 nvarchar(400) = @NoPrice + N': bu tarihte geçerli fiyat yok. Müşteri kartından ürüne fiyat girin.';
        THROW 50001, @Msg2, 1;
    END;

    DECLARE @New TABLE (OrderId int PRIMARY KEY, CustomerId int NOT NULL);

    BEGIN TRAN;
    DECLARE @Base int = ISNULL((
        SELECT MAX(SortOrder) FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK) WHERE EntryDate = @Date AND DriverId = @DriverId), 0);

    INSERT dbo.Orders (CustomerId, DriverId, EntryDate, SortOrder, CreatedBy, UpdatedBy)
    OUTPUT inserted.OrderId, inserted.CustomerId INTO @New (OrderId, CustomerId)
    SELECT i.CustomerId, @DriverId, @Date, @Base + ROW_NUMBER() OVER (ORDER BY i.Ord), @UserId, @UserId
    FROM @Ids i
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.CustomerId = i.CustomerId AND o.EntryDate = @Date AND o.DriverId = @DriverId);
    SET @Added = @@ROWCOUNT;

    INSERT dbo.OrderLines (OrderId, ProductId, UnitPrice)
    SELECT n.OrderId, cp.ProductId, p.Price
    FROM @New n
    JOIN dbo.CustomerProducts cp ON cp.CustomerId = n.CustomerId AND cp.IsActive = 1
    JOIN dbo.Products pr ON pr.ProductId = cp.ProductId AND pr.IsActive = 1
    CROSS APPLY dbo.tf_PriceOn(n.CustomerId, cp.ProductId, @Date) p;
    COMMIT;
END;
GO

-- Günün listesini verilen sırayla kaydeder. @OrderIds: [5, 9, 2] (ilk eleman en üstte).
CREATE OR ALTER PROCEDURE dbo.sp_Order_Reorder
    @UserId int,
    @Date smalldatetime,
    @OrderIds nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    SET @Date = CONVERT(smalldatetime, CONVERT(date, @Date));
    EXEC dbo.sp_Lock_Assert @Date;
    IF ISJSON(@OrderIds) = 0 THROW 50001, N'Geçersiz istek.', 1;

    UPDATE o
       SET SortOrder = x.Ord, UpdatedAt = dbo.fn_Now(), UpdatedBy = @UserId
      FROM dbo.Orders o
      JOIN (SELECT OrderId = TRY_CONVERT(int, j.[value]), Ord = CONVERT(int, j.[key]) + 1 FROM OPENJSON(@OrderIds) j) x
        ON x.OrderId = o.OrderId
     WHERE o.EntryDate = @Date AND o.SortOrder <> x.Ord;
END;
GO

-- Dağıtıcının geçen haftanın aynı günündeki listesini (aynı sırayla) bu güne ekler.
CREATE OR ALTER PROCEDURE dbo.sp_Order_CopyLastWeek
    @UserId int,
    @Date smalldatetime,
    @DriverId int = NULL,
    @Found int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @Date = CONVERT(smalldatetime, CONVERT(date, @Date));
    SET @DriverId = dbo.fn_ResolveDriver(@DriverId);
    IF @DriverId IS NULL THROW 50004, N'Dağıtıcı bulunamadı.', 1;

    DECLARE @Ids nvarchar(max) = (
        SELECT N'[' + STRING_AGG(CONVERT(nvarchar(max), o.CustomerId), N',') WITHIN GROUP (ORDER BY o.SortOrder, o.OrderId) + N']'
        FROM dbo.Orders o
        JOIN dbo.Customers c ON c.CustomerId = o.CustomerId AND c.IsActive = 1 AND c.BuysProducts = 1
        WHERE o.EntryDate = DATEADD(day, -7, @Date) AND o.DriverId = @DriverId);

    IF @Ids IS NULL THROW 50004, N'Geçen haftanın bu gününde bu dağıtıcının kaydı yok.', 1;
    SET @Found = (SELECT COUNT(*) FROM OPENJSON(@Ids));
    EXEC dbo.sp_Order_AddCustomers @UserId = @UserId, @Date = @Date, @DriverId = @DriverId, @CustomerIds = @Ids;
END;
GO

-- Müşterinin o gün verdiği para. Siparişin güncel toplamlarını döndürür.
CREATE OR ALTER PROCEDURE dbo.sp_Order_SetCollection
    @UserId int,
    @OrderId int,
    @Collection decimal(12, 2)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    IF @Collection IS NULL OR @Collection < 0 OR @Collection > 9999999
        THROW 50001, N'Girilen değer izin verilen aralığın dışında.', 1;

    DECLARE @Date smalldatetime = (SELECT EntryDate FROM dbo.Orders WHERE OrderId = @OrderId);
    IF @Date IS NULL THROW 50004, N'Kayıt bulunamadı.', 1;
    EXEC dbo.sp_Lock_Assert @Date;

    UPDATE dbo.Orders SET Collection = @Collection, UpdatedAt = dbo.fn_Now(), UpdatedBy = @UserId WHERE OrderId = @OrderId;

    SELECT DeliveredQty, ReturnedQty, NetAmount, Collection, BalanceDelta FROM dbo.Orders WHERE OrderId = @OrderId;
END;
GO

-- Ürün satırındaki verilen/iade adedini kaydeder; satırı ve siparişin yeni toplamlarını döndürür.
CREATE OR ALTER PROCEDURE dbo.sp_OrderLine_Save
    @UserId int,
    @OrderLineId int,
    @DeliveredQty int,
    @ReturnedQty int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    IF @DeliveredQty IS NULL OR @ReturnedQty IS NULL OR @DeliveredQty NOT BETWEEN 0 AND 100000 OR @ReturnedQty NOT BETWEEN 0 AND 100000
        THROW 50001, N'Girilen değer izin verilen aralığın dışında.', 1;

    DECLARE @OrderId int, @CustomerId int, @ProductId int, @Date smalldatetime;
    SELECT @OrderId = o.OrderId, @CustomerId = o.CustomerId, @ProductId = l.ProductId, @Date = o.EntryDate
    FROM dbo.OrderLines l JOIN dbo.Orders o ON o.OrderId = l.OrderId
    WHERE l.OrderLineId = @OrderLineId;
    IF @OrderId IS NULL THROW 50004, N'Kayıt bulunamadı.', 1;
    EXEC dbo.sp_Lock_Assert @Date;

    DECLARE @Price decimal(10, 2) = (SELECT Price FROM dbo.tf_PriceOn(@CustomerId, @ProductId, @Date));
    IF @Price IS NULL THROW 50001, N'Bu müşterinin bu ürün için bu tarihte geçerli bir fiyatı yok. Müşteri kartından ürüne fiyat girin.', 1;

    UPDATE dbo.OrderLines
       SET DeliveredQty = @DeliveredQty, ReturnedQty = @ReturnedQty, UnitPrice = @Price, UpdatedAt = dbo.fn_Now()
     WHERE OrderLineId = @OrderLineId;

    SELECT l.OrderLineId, l.DeliveredQty, l.ReturnedQty, l.UnitPrice, LineNetAmount = l.NetAmount,
           OrderDeliveredQty = o.DeliveredQty, OrderReturnedQty = o.ReturnedQty, OrderNetAmount = o.NetAmount,
           o.Collection, o.BalanceDelta
    FROM dbo.OrderLines l JOIN dbo.Orders o ON o.OrderId = l.OrderId
    WHERE l.OrderLineId = @OrderLineId;
END;
GO

-- Siparişe müşterinin bir ürününün satırını ekler.
CREATE OR ALTER PROCEDURE dbo.sp_OrderLine_Add
    @UserId int,
    @OrderId int,
    @ProductId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;

    DECLARE @CustomerId int, @Date smalldatetime;
    SELECT @CustomerId = CustomerId, @Date = EntryDate FROM dbo.Orders WHERE OrderId = @OrderId;
    IF @CustomerId IS NULL THROW 50004, N'Kayıt bulunamadı.', 1;
    EXEC dbo.sp_Lock_Assert @Date;
    IF NOT EXISTS (SELECT 1 FROM dbo.Products WHERE ProductId = @ProductId AND IsActive = 1)
        THROW 50001, N'Pasif ürün eklenemez.', 1;
    IF EXISTS (SELECT 1 FROM dbo.OrderLines WHERE OrderId = @OrderId AND ProductId = @ProductId)
        THROW 50002, N'Bu ürün bu müşterinin satırında zaten var.', 1;

    DECLARE @Price decimal(10, 2) = (SELECT Price FROM dbo.tf_PriceOn(@CustomerId, @ProductId, @Date));
    IF @Price IS NULL THROW 50001, N'Bu müşterinin bu ürün için bu tarihte geçerli bir fiyatı yok. Müşteri kartından ürüne fiyat girin.', 1;

    INSERT dbo.OrderLines (OrderId, ProductId, UnitPrice) VALUES (@OrderId, @ProductId, @Price);
    SELECT OrderLineId = CONVERT(int, SCOPE_IDENTITY());
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_OrderLine_Delete
    @UserId int,
    @OrderLineId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    DECLARE @Date smalldatetime = (
        SELECT o.EntryDate FROM dbo.OrderLines l JOIN dbo.Orders o ON o.OrderId = l.OrderId WHERE l.OrderLineId = @OrderLineId);
    IF @Date IS NULL THROW 50004, N'Kayıt bulunamadı.', 1;
    EXEC dbo.sp_Lock_Assert @Date;
    DELETE dbo.OrderLines WHERE OrderLineId = @OrderLineId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Order_Delete
    @UserId int,
    @OrderId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    DECLARE @Date smalldatetime = (SELECT EntryDate FROM dbo.Orders WHERE OrderId = @OrderId);
    IF @Date IS NULL THROW 50004, N'Kayıt bulunamadı.', 1;
    EXEC dbo.sp_Lock_Assert @Date;
    DELETE dbo.Orders WHERE OrderId = @OrderId; -- satırlar cascade ile silinir
END;
GO

-- Haftalık tablo: 1) siparişler 2) ürün satırları 3) dağıtıcı giderleri 4) dağıtıcı gün sonları.
CREATE OR ALTER PROCEDURE dbo.sp_Week_Board
    @Date smalldatetime
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Start smalldatetime = dbo.fn_WeekStart(@Date);
    DECLARE @End smalldatetime = DATEADD(day, 6, @Start);
    DECLARE @Locked bit = dbo.fn_IsLocked(@Start);

    SELECT o.OrderId, o.CustomerId, CustomerName = c.Name, c.CustomerTypeId, o.DriverId, o.EntryDate, o.SortOrder,
           o.DeliveredQty, o.ReturnedQty, o.NetAmount, o.Collection, o.BalanceDelta, o.Note, IsLocked = @Locked
    FROM dbo.Orders o
    JOIN dbo.Customers c ON c.CustomerId = o.CustomerId
    WHERE o.EntryDate BETWEEN @Start AND @End
    ORDER BY o.EntryDate, o.DriverId, o.SortOrder, c.Name;

    SELECT l.OrderLineId, l.OrderId, l.ProductId, l.ProductName, l.ProductUnit,
           l.DeliveredQty, l.ReturnedQty, l.UnitPrice, l.NetAmount
    FROM dbo.vw_OrderLineDetails l
    JOIN dbo.Products p ON p.ProductId = l.ProductId
    WHERE l.EntryDate BETWEEN @Start AND @End
    ORDER BY l.OrderId, p.SortOrder, l.ProductName;

    SELECT e.ExpenseId, e.EntryDate, e.DriverId, e.Amount, e.ExpenseCategoryId, CategoryName = ec.Name, e.Description
    FROM dbo.Expenses e
    LEFT JOIN dbo.ExpenseCategories ec ON ec.ExpenseCategoryId = e.ExpenseCategoryId
    WHERE e.ExpensePlaceId = 3 AND e.EntryDate BETWEEN @Start AND @End
    ORDER BY e.CreatedAt, e.ExpenseId;

    SELECT dd.EntryDate, dd.DriverId, dd.HandedOver
    FROM dbo.DriverDays dd
    WHERE dd.EntryDate BETWEEN @Start AND @End;
END;
GO

/* -----------------------------------------------------------------------------
   Dağıtıcılar (yalnızca yönetici)
----------------------------------------------------------------------------- */

-- @DriverId NULL ise yeni dağıtıcı; değilse ad değişir.
CREATE OR ALTER PROCEDURE dbo.sp_Driver_Save
    @UserId int,
    @DriverId int = NULL,
    @Name nvarchar(100),
    @SavedDriverId int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId, @AdminOnly = 1;
    SET @Name = dbo.fn_CleanName(@Name);
    IF @Name IS NULL OR LEN(@Name) > 60 THROW 50001, N'Dağıtıcı adı gerekli (en çok 60 karakter).', 1;
    IF EXISTS (SELECT 1 FROM dbo.Drivers WHERE Name = @Name AND DriverId <> ISNULL(@DriverId, 0))
        THROW 50002, N'Bu isimde bir dağıtıcı zaten var.', 1;

    IF @DriverId IS NULL
    BEGIN
        INSERT dbo.Drivers (Name, SortOrder) VALUES (@Name, ISNULL((SELECT MAX(SortOrder) FROM dbo.Drivers), 0) + 1);
        SET @SavedDriverId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.Drivers SET Name = @Name WHERE DriverId = @DriverId;
        IF @@ROWCOUNT = 0 THROW 50004, N'Dağıtıcı bulunamadı.', 1;
        SET @SavedDriverId = @DriverId;
    END;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Driver_SetActive
    @UserId int,
    @DriverId int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId, @AdminOnly = 1;
    UPDATE dbo.Drivers SET IsActive = @IsActive WHERE DriverId = @DriverId AND IsOwner = 0;
    IF @@ROWCOUNT = 0 THROW 50003, N'Bu dağıtıcı pasife alınamaz.', 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_DriverDay_SaveHandover
    @UserId int,
    @Date smalldatetime,
    @DriverId int,
    @HandedOver decimal(12, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    SET @Date = CONVERT(smalldatetime, CONVERT(date, @Date));
    EXEC dbo.sp_Lock_Assert @Date;
    IF @HandedOver IS NOT NULL AND (@HandedOver < 0 OR @HandedOver >= 10000000)
        THROW 50001, N'Girilen değer izin verilen aralığın dışında.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Drivers WHERE DriverId = @DriverId) THROW 50004, N'Dağıtıcı bulunamadı.', 1;

    BEGIN TRAN;
    UPDATE dbo.DriverDays WITH (UPDLOCK, HOLDLOCK)
       SET HandedOver = @HandedOver, UpdatedAt = dbo.fn_Now(), UpdatedBy = @UserId
     WHERE EntryDate = @Date AND DriverId = @DriverId;
    IF @@ROWCOUNT = 0
        INSERT dbo.DriverDays (EntryDate, DriverId, HandedOver, UpdatedBy) VALUES (@Date, @DriverId, @HandedOver, @UserId);
    COMMIT;
END;
GO

/* -----------------------------------------------------------------------------
   Giderler
----------------------------------------------------------------------------- */

-- @ExpensePlaceId 1 genel, 2 tezgah, 3 dağıtıcı · @ExpenseKindId 1 gider, 2 cari ödeme
-- @PaymentMethodId 1 peşin, 2 cariye. Cari ödemede ödeme şekli peşin ve tür boş olur.
CREATE OR ALTER PROCEDURE dbo.sp_Expense_Add
    @UserId int,
    @Date smalldatetime,
    @ExpensePlaceId int,
    @DriverId int = NULL,
    @CustomerId int = NULL,
    @ExpenseKindId int = 1,
    @PaymentMethodId int = 1,
    @ExpenseCategoryId int = NULL,
    @Amount decimal(12, 2),
    @Description nvarchar(300) = NULL,
    @ExpenseId int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    SET @Date = CONVERT(smalldatetime, CONVERT(date, @Date));
    EXEC dbo.sp_Lock_Assert @Date;

    SET @Description = dbo.fn_CleanText(@Description);
    IF @ExpenseKindId = 2 SELECT @PaymentMethodId = 1, @ExpenseCategoryId = NULL;
    IF @ExpensePlaceId <> 3 SET @DriverId = NULL;

    IF @ExpensePlaceId NOT IN (1, 2, 3) OR @ExpenseKindId NOT IN (1, 2) OR @PaymentMethodId NOT IN (1, 2)
        THROW 50001, N'Geçersiz istek.', 1;
    IF @ExpensePlaceId = 3 AND NOT EXISTS (SELECT 1 FROM dbo.Drivers WHERE DriverId = @DriverId)
        THROW 50001, N'Dağıtıcı seçin.', 1;
    IF (@ExpenseKindId = 2 OR @PaymentMethodId = 2) AND @CustomerId IS NULL
        THROW 50001, N'Cari (müşteri) seçin.', 1;
    IF @CustomerId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE CustomerId = @CustomerId)
        THROW 50004, N'Cari bulunamadı.', 1;
    IF @ExpenseCategoryId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ExpenseCategories WHERE ExpenseCategoryId = @ExpenseCategoryId)
        THROW 50001, N'Gider türü bulunamadı.', 1;
    IF @Amount IS NULL OR @Amount <= 0 OR @Amount >= 10000000 THROW 50001, N'Gider tutarı girin.', 1;
    IF LEN(@Description) > 200 THROW 50001, N'Açıklama çok uzun.', 1;

    INSERT dbo.Expenses (EntryDate, ExpensePlaceId, DriverId, CustomerId, ExpenseKindId, PaymentMethodId,
                         ExpenseCategoryId, Amount, Description, CreatedBy)
    VALUES (@Date, @ExpensePlaceId, @DriverId, @CustomerId, @ExpenseKindId, @PaymentMethodId,
            @ExpenseCategoryId, @Amount, @Description, @UserId);
    SET @ExpenseId = SCOPE_IDENTITY();
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Expense_Delete
    @UserId int,
    @ExpenseId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    DECLARE @Date smalldatetime = (SELECT EntryDate FROM dbo.Expenses WHERE ExpenseId = @ExpenseId);
    IF @Date IS NULL THROW 50004, N'Kayıt bulunamadı.', 1;
    EXEC dbo.sp_Lock_Assert @Date;
    DELETE dbo.Expenses WHERE ExpenseId = @ExpenseId;
END;
GO

-- Yeni gider türü (her aktif kullanıcı). Daha önce kaldırılmışsa geri açılır.
CREATE OR ALTER PROCEDURE dbo.sp_ExpenseCategory_Create
    @UserId int,
    @Name nvarchar(80),
    @ExpenseCategoryId int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    SET @Name = dbo.fn_CleanName(@Name);
    IF @Name IS NULL OR LEN(@Name) > 40 THROW 50001, N'Gider türünü yazın (en çok 40 karakter).', 1;

    SELECT @ExpenseCategoryId = ExpenseCategoryId FROM dbo.ExpenseCategories WHERE Name = @Name;
    IF @ExpenseCategoryId IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.ExpenseCategories WHERE ExpenseCategoryId = @ExpenseCategoryId AND IsActive = 1)
            THROW 50002, N'Bu gider türü zaten var.', 1;
        UPDATE dbo.ExpenseCategories SET IsActive = 1 WHERE ExpenseCategoryId = @ExpenseCategoryId;
        RETURN;
    END;

    INSERT dbo.ExpenseCategories (Name, SortOrder) VALUES (@Name, 50);
    SET @ExpenseCategoryId = SCOPE_IDENTITY();
END;
GO

-- Gider türünü listeden kaldırır (yönetici). Eski giderler türünü korur.
CREATE OR ALTER PROCEDURE dbo.sp_ExpenseCategory_Deactivate
    @UserId int,
    @ExpenseCategoryId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId, @AdminOnly = 1;
    UPDATE dbo.ExpenseCategories SET IsActive = 0 WHERE ExpenseCategoryId = @ExpenseCategoryId;
    IF @@ROWCOUNT = 0 THROW 50004, N'Gider türü bulunamadı.', 1;
END;
GO

/* -----------------------------------------------------------------------------
   Tezgah
----------------------------------------------------------------------------- */

-- Tezgahtan gelen ekmek parası (ekmek çeşidi fark etmez).
CREATE OR ALTER PROCEDURE dbo.sp_CounterDay_SaveBread
    @UserId int,
    @Date smalldatetime,
    @SalesIncome decimal(12, 2)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    SET @Date = CONVERT(smalldatetime, CONVERT(date, @Date));
    EXEC dbo.sp_Lock_Assert @Date;
    IF @SalesIncome IS NULL OR @SalesIncome < 0 OR @SalesIncome >= 10000000
        THROW 50001, N'Tutar izin verilen aralığın dışında.', 1;

    BEGIN TRAN;
    UPDATE dbo.CounterDays WITH (UPDLOCK, HOLDLOCK)
       SET SalesIncome = @SalesIncome, UpdatedAt = dbo.fn_Now(), UpdatedBy = @UserId
     WHERE EntryDate = @Date;
    IF @@ROWCOUNT = 0
        INSERT dbo.CounterDays (EntryDate, SalesIncome, BreadPrice, UpdatedBy)
        VALUES (@Date, @SalesIncome, (SELECT CounterBreadPrice FROM dbo.Settings WHERE SettingsId = 1), @UserId);
    COMMIT;
END;
GO

-- Tezgahta satılan ek ürün. Aynı gün + aynı ad + aynı fiyat varsa adet artar.
CREATE OR ALTER PROCEDURE dbo.sp_CounterSale_Add
    @UserId int,
    @Date smalldatetime,
    @Name nvarchar(100),
    @Qty decimal(10, 2),
    @UnitPrice decimal(12, 2)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    SET @Date = CONVERT(smalldatetime, CONVERT(date, @Date));
    EXEC dbo.sp_Lock_Assert @Date;
    SET @Name = dbo.fn_CleanName(@Name);
    IF @Name IS NULL OR LEN(@Name) > 60 THROW 50001, N'Ürün adını yazın.', 1;
    IF @Qty IS NULL OR @Qty <= 0 OR @Qty >= 100000 THROW 50001, N'Adet girin.', 1;
    IF @UnitPrice IS NULL OR @UnitPrice < 0 OR @UnitPrice >= 1000000 THROW 50001, N'Fiyat girin.', 1;

    DECLARE @ProductId int = (SELECT ProductId FROM dbo.Products WHERE Name = @Name); -- ad katalogla eşleşirse bağlanır

    BEGIN TRAN;
    UPDATE dbo.CounterSales WITH (UPDLOCK, HOLDLOCK)
       SET Qty = Qty + @Qty, UpdatedAt = dbo.fn_Now()
     WHERE EntryDate = @Date AND Name = @Name AND UnitPrice = @UnitPrice;
    IF @@ROWCOUNT = 0
        INSERT dbo.CounterSales (EntryDate, ProductId, Name, Qty, UnitPrice, CreatedBy)
        VALUES (@Date, @ProductId, @Name, @Qty, @UnitPrice, @UserId);
    COMMIT;
END;
GO

-- Tezgah satırının adedini değiştirir; 0 olursa satır silinir.
CREATE OR ALTER PROCEDURE dbo.sp_CounterSale_SetQty
    @UserId int,
    @CounterSaleId int,
    @Qty decimal(10, 2)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.sp_Auth_Begin @UserId;
    IF @Qty IS NULL OR @Qty < 0 OR @Qty >= 100000 THROW 50001, N'Geçersiz istek.', 1;
    DECLARE @Date smalldatetime = (SELECT EntryDate FROM dbo.CounterSales WHERE CounterSaleId = @CounterSaleId);
    IF @Date IS NULL THROW 50004, N'Kayıt bulunamadı.', 1;
    EXEC dbo.sp_Lock_Assert @Date;

    IF @Qty = 0
        DELETE dbo.CounterSales WHERE CounterSaleId = @CounterSaleId;
    ELSE
        UPDATE dbo.CounterSales SET Qty = @Qty, UpdatedAt = dbo.fn_Now() WHERE CounterSaleId = @CounterSaleId;
END;
GO

/* -----------------------------------------------------------------------------
   Raporlar
----------------------------------------------------------------------------- */

-- Genel toplamlar: gün / hafta / ay / yıl gruplu.
CREATE OR ALTER PROCEDURE dbo.sp_Report_Totals
    @From smalldatetime,
    @To smalldatetime,
    @Group varchar(5) = 'day'
AS
BEGIN
    SET NOCOUNT ON;
    IF @Group NOT IN ('day', 'week', 'month', 'year') THROW 50001, N'Geçersiz gruplama.', 1;

    SELECT ps.PeriodStart,
           DeliveredQty = SUM(o.DeliveredQty), ReturnedQty = SUM(o.ReturnedQty),
           GrossAmount = SUM(o.GrossAmount), ReturnAmount = SUM(o.ReturnAmount), NetAmount = SUM(o.NetAmount),
           Collection = SUM(o.Collection), PeriodDelta = SUM(o.BalanceDelta),
           CustomerCount = COUNT(DISTINCT o.CustomerId)
    FROM dbo.Orders o
    CROSS APPLY dbo.tf_PeriodStart(o.EntryDate, @Group) ps
    WHERE o.EntryDate BETWEEN @From AND @To
    GROUP BY ps.PeriodStart
    ORDER BY ps.PeriodStart;
END;
GO

-- Dönem özeti (müşteri bazında): devreden, dönem hareketleri, kapanış bakiyesi.
CREATE OR ALTER PROCEDURE dbo.sp_Report_CustomerPeriod
    @From smalldatetime,
    @To smalldatetime
AS
BEGIN
    SET NOCOUNT ON;
    WITH opening AS (
        SELECT CustomerId, Amount = SUM(Delta) FROM dbo.vw_CustomerMoves WHERE EntryDate < @From GROUP BY CustomerId
    ), period AS (
        SELECT CustomerId, DeliveredQty = SUM(DeliveredQty), ReturnedQty = SUM(ReturnedQty),
               GrossAmount = SUM(GrossAmount), ReturnAmount = SUM(ReturnAmount), NetAmount = SUM(NetAmount),
               Collection = SUM(Collection), EntryDays = COUNT(*)
        FROM dbo.Orders WHERE EntryDate BETWEEN @From AND @To GROUP BY CustomerId
    ), moved AS (
        SELECT CustomerId, Delta = SUM(Delta) FROM dbo.vw_CustomerMoves WHERE EntryDate BETWEEN @From AND @To GROUP BY CustomerId
    )
    SELECT c.CustomerId, CustomerName = c.Name, c.CustomerTypeId,
           OpeningBalance = ISNULL(op.Amount, 0),
           DeliveredQty = ISNULL(pe.DeliveredQty, 0), ReturnedQty = ISNULL(pe.ReturnedQty, 0),
           GrossAmount = ISNULL(pe.GrossAmount, 0), ReturnAmount = ISNULL(pe.ReturnAmount, 0),
           NetAmount = ISNULL(pe.NetAmount, 0), Collection = ISNULL(pe.Collection, 0),
           PeriodDelta = ISNULL(mv.Delta, 0),
           ClosingBalance = ISNULL(op.Amount, 0) + ISNULL(mv.Delta, 0),
           EntryDays = ISNULL(pe.EntryDays, 0)
    FROM dbo.Customers c
    LEFT JOIN opening op ON op.CustomerId = c.CustomerId
    LEFT JOIN period pe ON pe.CustomerId = c.CustomerId
    LEFT JOIN moved mv ON mv.CustomerId = c.CustomerId
    WHERE pe.CustomerId IS NOT NULL OR mv.CustomerId IS NOT NULL OR ISNULL(op.Amount, 0) <> 0
    ORDER BY c.Name;
END;
GO

-- Ürün bazında günlük satış: dağıtım (verilen − iade) + tezgah.
CREATE OR ALTER PROCEDURE dbo.sp_Report_ProductDaily
    @From smalldatetime,
    @To smalldatetime
AS
BEGIN
    SET NOCOUNT ON;
    SELECT EntryDate, ProductId,
           RouteQty = SUM(RouteQty), RouteAmount = SUM(RouteAmount),
           CounterQty = SUM(CounterQty), CounterAmount = SUM(CounterAmount),
           Customers = MAX(Customers)
    FROM (
        SELECT o.EntryDate, l.ProductId,
               RouteQty = CONVERT(decimal(14, 2), SUM(l.DeliveredQty - l.ReturnedQty)), RouteAmount = SUM(l.NetAmount),
               CounterQty = CONVERT(decimal(14, 2), 0), CounterAmount = CONVERT(decimal(14, 2), 0),
               Customers = COUNT(DISTINCT o.CustomerId)
        FROM dbo.OrderLines l
        JOIN dbo.Orders o ON o.OrderId = l.OrderId
        WHERE o.EntryDate BETWEEN @From AND @To
        GROUP BY o.EntryDate, l.ProductId
        UNION ALL
        SELECT s.EntryDate, s.ProductId, 0, 0, SUM(s.Qty), SUM(s.Amount), 0
        FROM dbo.CounterSales s
        WHERE s.ProductId IS NOT NULL AND s.EntryDate BETWEEN @From AND @To
        GROUP BY s.EntryDate, s.ProductId
    ) x
    GROUP BY EntryDate, ProductId
    ORDER BY EntryDate, ProductId;
END;
GO

/* -----------------------------------------------------------------------------
   Bakım: veri bütünlüğü denetimi (sorun yoksa boş sonuç)
----------------------------------------------------------------------------- */

CREATE OR ALTER PROCEDURE dbo.sp_Admin_CheckIntegrity
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Problem = N'Sipariş toplamı satırlarla tutmuyor', RecordId = o.OrderId
    FROM dbo.Orders o
    OUTER APPLY (SELECT D = SUM(DeliveredQty), R = SUM(ReturnedQty), N = SUM(NetAmount) FROM dbo.OrderLines l WHERE l.OrderId = o.OrderId) s
    WHERE o.DeliveredQty <> ISNULL(s.D, 0) OR o.ReturnedQty <> ISNULL(s.R, 0) OR o.NetAmount <> ISNULL(s.N, 0)
    UNION ALL
    SELECT N'Satır fiyatı fiyat geçmişiyle tutmuyor', l.OrderLineId
    FROM dbo.OrderLines l
    JOIN dbo.Orders o ON o.OrderId = l.OrderId
    OUTER APPLY dbo.tf_PriceOn(o.CustomerId, l.ProductId, o.EntryDate) p
    WHERE p.Price IS NULL OR p.Price <> l.UnitPrice
    UNION ALL
    SELECT N'Birden fazla sahip dağıtıcı', DriverId FROM dbo.Drivers WHERE IsOwner = 1
        AND (SELECT COUNT(*) FROM dbo.Drivers WHERE IsOwner = 1) > 1;
END;
GO
