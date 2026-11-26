/* Uçtan uca senaryo testi. YALNIZCA geri alınan bir transaction içinde çalıştırılır
   (kur.cjs --dene --test). Beklenen değerler yorumlarda. */
SET NOCOUNT ON;
DECLARE @U int, @P int, @P2 int, @C int, @T smalldatetime = dbo.fn_Today(), @Ids nvarchar(100), @L int, @O int, @E int;

EXEC dbo.sp_User_Create 'Test@Ornek.com', N'Test', 'hash', @U OUTPUT;                 -- ilk kullanıcı: aktif yönetici
INSERT dbo.Settings (SettingsId) VALUES (1);
INSERT dbo.ProductCategories (Name, IsBread, ColorId, SortOrder) VALUES (N'Ekmek', 1, 1, 1), (N'Yağ', 0, 2, 2);
EXEC dbo.sp_Product_Save @UserId = @U, @CategoryId = 1, @Name = N'Ekmek', @SavedProductId = @P OUTPUT;
EXEC dbo.sp_Product_Save @UserId = @U, @CategoryId = 2, @Name = N'Zeytin Yağı', @Unit = N'lt', @SuggestedPrice = 1500, @SavedProductId = @P2 OUTPUT;
INSERT dbo.Drivers (Name, IsOwner, SortOrder) VALUES (N'Ben', 1, 1);

EXEC dbo.sp_Customer_Create @UserId = @U, @CustomerTypeId = 1, @Name = N'  ahmet    yılmaz ',
     @Products = N'[{"productId":1,"price":40}]', @CustomerId = @C OUTPUT;
SET @Ids = N'[' + CONVERT(nvarchar(20), @C) + N']';
EXEC dbo.sp_Order_AddCustomers @UserId = @U, @Date = @T, @CustomerIds = @Ids;          -- 1 sipariş + Ekmek satırı (40 ₺)
SELECT @O = OrderId FROM dbo.Orders WHERE CustomerId = @C;
SELECT @L = OrderLineId FROM dbo.OrderLines WHERE OrderId = @O;
EXEC dbo.sp_OrderLine_Save @U, @L, 10, 2;                                              -- 8 × 40 = 320
EXEC dbo.sp_Order_SetCollection @U, @O, 100;                                           -- fark 220
EXEC dbo.sp_CustomerPrice_Set @U, @C, @P, 45, @T;                                      -- yeniden fiyat: 8 × 45 = 360, fark 260
EXEC dbo.sp_Expense_Add @UserId = @U, @Date = @T, @ExpensePlaceId = 1, @CustomerId = @C,
     @PaymentMethodId = 2, @Amount = 50, @ExpenseId = @E OUTPUT;                       -- cariye gider: bakiye 260 − 50 = 210

SELECT Test = 'musteri', Name, Balance, Products FROM dbo.vw_CustomerOverview;        -- "ahmet yılmaz", 210.00, [Ekmek 45]
SELECT Test = 'siparis', DeliveredQty, ReturnedQty, NetAmount, Collection, BalanceDelta FROM dbo.Orders; -- 10, 2, 360, 100, 260
SELECT Test = 'butunluk', * FROM (SELECT 1 x) d CROSS APPLY (SELECT n = COUNT(*) FROM dbo.Orders) c; -- yer tutucu
EXEC dbo.sp_Admin_CheckIntegrity;                                                      -- boş olmalı
EXEC dbo.sp_Customer_Statement @C, @T, @T, 'day';                                      -- fark 210, bakiye 210
EXEC dbo.sp_Report_Totals @T, @T, 'week';
EXEC dbo.sp_Report_CustomerPeriod @T, @T;
SELECT Test = 'audit', TableName, Islem = AuditActionId, ChangedBy, Adet = COUNT(*) FROM dbo.AuditLog GROUP BY TableName, AuditActionId, ChangedBy ORDER BY TableName, AuditActionId;
SELECT Test = 'hafta', WeekStart = dbo.fn_WeekStart(@T), Today = @T, Now = dbo.fn_Now(), Locked = dbo.fn_IsLocked(DATEADD(day, -8, @T));

-- Hata testi ayrı batch olarak çalışır: THROW işlemi bozar, zaten geri alınacak.
--HATA-TESTI--
DECLARE @U int = (SELECT MIN(UserId) FROM dbo.Users), @C int;
EXEC dbo.sp_Customer_Create @UserId = @U, @CustomerTypeId = 1, @Name = N'AHMET YILMAZ', @Products = N'[{"productId":1,"price":40}]', @CustomerId = @C OUTPUT;
-- beklenen: 50002 Bu isimde bir müşteri zaten var.
