/* =============================================================================
   Ekmekçi — MSSQL şeması (SQL Server 2017+, Turkish_CI_AS)
   01 · Lookup ve ana tablolar, kısıtlar, indexler

   Kurallar
   * Bütün anahtarlar int; her ilişki FK ile bağlı.
   * Tipler: int, varchar (kodlar, e-posta), nvarchar (isim ve Türkçe metin),
     smalldatetime (tarih ve zaman, Türkiye saati), decimal (para ve miktar).
     Evet/hayır bayrakları bit.
   * Gün alanları (EntryDate, ValidFrom) smalldatetime, saat kısmı her zaman 00:00 (CHECK).
   * İsimler Turkish_CI_AS ile benzersiz: "ekmek" = "EKMEK", "ı" ile "I" ve "i" ile "İ" eşleşir.
   * Bakiye: + müşteri borçlu, − müşteri alacaklı.
============================================================================= */
SET NOCOUNT ON;
GO

/* -----------------------------------------------------------------------------
   Lookup tabloları (sabit kimlikler, uygulama bu sayılara güvenir)
----------------------------------------------------------------------------- */

CREATE TABLE dbo.Roles (
    RoleId   int          NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    Code     varchar(20)  NOT NULL CONSTRAINT UQ_Roles_Code UNIQUE,
    Name     nvarchar(40) NOT NULL
);

CREATE TABLE dbo.CustomerTypes (
    CustomerTypeId int          NOT NULL CONSTRAINT PK_CustomerTypes PRIMARY KEY,
    Code           varchar(20)  NOT NULL CONSTRAINT UQ_CustomerTypes_Code UNIQUE,
    Name           nvarchar(40) NOT NULL
);

CREATE TABLE dbo.Colors (
    ColorId int          NOT NULL CONSTRAINT PK_Colors PRIMARY KEY,
    Code    varchar(20)  NOT NULL CONSTRAINT UQ_Colors_Code UNIQUE,
    Name    nvarchar(20) NOT NULL
);

CREATE TABLE dbo.ExpensePlaces (
    ExpensePlaceId int          NOT NULL CONSTRAINT PK_ExpensePlaces PRIMARY KEY,
    Code           varchar(20)  NOT NULL CONSTRAINT UQ_ExpensePlaces_Code UNIQUE,
    Name           nvarchar(40) NOT NULL
);

CREATE TABLE dbo.ExpenseKinds (
    ExpenseKindId int          NOT NULL CONSTRAINT PK_ExpenseKinds PRIMARY KEY,
    Code          varchar(20)  NOT NULL CONSTRAINT UQ_ExpenseKinds_Code UNIQUE,
    Name          nvarchar(40) NOT NULL
);

CREATE TABLE dbo.PaymentMethods (
    PaymentMethodId int          NOT NULL CONSTRAINT PK_PaymentMethods PRIMARY KEY,
    Code            varchar(20)  NOT NULL CONSTRAINT UQ_PaymentMethods_Code UNIQUE,
    Name            nvarchar(40) NOT NULL
);

CREATE TABLE dbo.AuditActions (
    AuditActionId int          NOT NULL CONSTRAINT PK_AuditActions PRIMARY KEY,
    Code          varchar(10)  NOT NULL CONSTRAINT UQ_AuditActions_Code UNIQUE,
    Name          nvarchar(20) NOT NULL
);

INSERT dbo.Roles (RoleId, Code, Name) VALUES
    (1, 'admin', N'Yönetici'),
    (2, 'user',  N'Kullanıcı');

INSERT dbo.CustomerTypes (CustomerTypeId, Code, Name) VALUES
    (1, 'person',  N'Şahıs'),
    (2, 'company', N'Kurumsal');

INSERT dbo.Colors (ColorId, Code, Name) VALUES
    (1, 'amber',   N'Sarı'),
    (2, 'emerald', N'Yeşil'),
    (3, 'sky',     N'Mavi'),
    (4, 'violet',  N'Mor'),
    (5, 'rose',    N'Pembe'),
    (6, 'orange',  N'Turuncu'),
    (7, 'teal',    N'Turkuaz'),
    (8, 'indigo',  N'Lacivert'),
    (9, 'lime',    N'Fıstık'),
    (10, 'fuchsia', N'Fuşya');

INSERT dbo.ExpensePlaces (ExpensePlaceId, Code, Name) VALUES
    (1, 'general', N'Genel'),
    (2, 'counter', N'Tezgah'),
    (3, 'driver',  N'Dağıtıcı');

INSERT dbo.ExpenseKinds (ExpenseKindId, Code, Name) VALUES
    (1, 'expense', N'Gider'),
    (2, 'payment', N'Cari ödeme');

INSERT dbo.PaymentMethods (PaymentMethodId, Code, Name) VALUES
    (1, 'cash',    N'Peşin'),
    (2, 'account', N'Cariye');

INSERT dbo.AuditActions (AuditActionId, Code, Name) VALUES
    (1, 'INSERT', N'Ekleme'),
    (2, 'UPDATE', N'Güncelleme'),
    (3, 'DELETE', N'Silme');
GO

/* -----------------------------------------------------------------------------
   Kullanıcılar ve ayarlar
----------------------------------------------------------------------------- */

CREATE TABLE dbo.Users (
    UserId       int           IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    -- E-posta Türkçe kurala tabi olmasın ("I" ↔ "i"); her zaman küçük harfle saklanır.
    Email        varchar(254)  COLLATE Latin1_General_CI_AS NOT NULL,
    FullName     nvarchar(100) NOT NULL CONSTRAINT DF_Users_FullName DEFAULT (N''),
    PasswordHash varchar(100)  NULL,
    RoleId       int           NOT NULL CONSTRAINT FK_Users_Roles REFERENCES dbo.Roles (RoleId),
    IsActive     bit           NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (0),
    LastLoginAt  smalldatetime NULL,
    CreatedAt    smalldatetime NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    UpdatedAt    smalldatetime NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT UQ_Users_Email UNIQUE (Email),
    CONSTRAINT CK_Users_Email CHECK (Email = LOWER(Email) AND Email LIKE '%_@_%')
);

CREATE TABLE dbo.Settings (
    SettingsId        int           NOT NULL CONSTRAINT PK_Settings PRIMARY KEY CONSTRAINT CK_Settings_Single CHECK (SettingsId = 1),
    LockPastWeeks     bit           NOT NULL CONSTRAINT DF_Settings_Lock DEFAULT (1),
    CounterBreadPrice decimal(10, 2) NULL CONSTRAINT CK_Settings_BreadPrice CHECK (CounterBreadPrice > 0 AND CounterBreadPrice < 100000),
    UpdatedAt         smalldatetime NOT NULL CONSTRAINT DF_Settings_UpdatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    UpdatedBy         int           NULL CONSTRAINT FK_Settings_Users REFERENCES dbo.Users (UserId)
);
GO

/* -----------------------------------------------------------------------------
   Müşteriler
----------------------------------------------------------------------------- */

CREATE TABLE dbo.Customers (
    CustomerId     int            IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Customers PRIMARY KEY,
    CustomerTypeId int            NOT NULL CONSTRAINT FK_Customers_CustomerTypes REFERENCES dbo.CustomerTypes (CustomerTypeId),
    Name           nvarchar(120)  NOT NULL,
    Address        nvarchar(500)  NULL,
    Note           nvarchar(1000) NULL,
    BuysProducts   bit            NOT NULL CONSTRAINT DF_Customers_BuysProducts DEFAULT (1),
    IsActive       bit            NOT NULL CONSTRAINT DF_Customers_IsActive DEFAULT (1),
    CreatedAt      smalldatetime  NOT NULL CONSTRAINT DF_Customers_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CreatedBy      int            NULL CONSTRAINT FK_Customers_CreatedBy REFERENCES dbo.Users (UserId),
    UpdatedAt      smalldatetime  NOT NULL CONSTRAINT DF_Customers_UpdatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    UpdatedBy      int            NULL CONSTRAINT FK_Customers_UpdatedBy REFERENCES dbo.Users (UserId),
    CONSTRAINT UQ_Customers_Name UNIQUE (Name),
    CONSTRAINT CK_Customers_Name CHECK (LEN(Name) >= 1 AND Name = LTRIM(RTRIM(Name))),
    CONSTRAINT CK_Customers_Address CHECK (Address IS NULL OR LEN(Address) >= 1),
    CONSTRAINT CK_Customers_Note CHECK (Note IS NULL OR LEN(Note) >= 1)
);
GO

/* -----------------------------------------------------------------------------
   Ürünler
----------------------------------------------------------------------------- */

CREATE TABLE dbo.ProductCategories (
    CategoryId int           IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ProductCategories PRIMARY KEY,
    Name       nvarchar(40)  NOT NULL,
    IsBread    bit           NOT NULL CONSTRAINT DF_ProductCategories_IsBread DEFAULT (0),
    ColorId    int           NOT NULL CONSTRAINT DF_ProductCategories_Color DEFAULT (2)
                             CONSTRAINT FK_ProductCategories_Colors REFERENCES dbo.Colors (ColorId),
    SortOrder  int           NOT NULL CONSTRAINT DF_ProductCategories_Sort DEFAULT (0),
    CreatedAt  smalldatetime NOT NULL CONSTRAINT DF_ProductCategories_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT UQ_ProductCategories_Name UNIQUE (Name),
    CONSTRAINT CK_ProductCategories_Name CHECK (LEN(Name) >= 1 AND Name = LTRIM(RTRIM(Name)))
);

CREATE TABLE dbo.Products (
    ProductId      int            IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Products PRIMARY KEY,
    CategoryId     int            NOT NULL CONSTRAINT FK_Products_Categories REFERENCES dbo.ProductCategories (CategoryId),
    Name           nvarchar(60)   NOT NULL,
    Unit           nvarchar(12)   NOT NULL CONSTRAINT DF_Products_Unit DEFAULT (N'adet'),
    SuggestedPrice decimal(10, 2) NULL,
    IsActive       bit            NOT NULL CONSTRAINT DF_Products_IsActive DEFAULT (1),
    SortOrder      int            NOT NULL CONSTRAINT DF_Products_Sort DEFAULT (0),
    CreatedAt      smalldatetime  NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT UQ_Products_Name UNIQUE (Name),
    CONSTRAINT CK_Products_Name CHECK (LEN(Name) >= 1 AND Name = LTRIM(RTRIM(Name))),
    CONSTRAINT CK_Products_Unit CHECK (LEN(Unit) >= 1),
    CONSTRAINT CK_Products_SuggestedPrice CHECK (SuggestedPrice IS NULL OR (SuggestedPrice > 0 AND SuggestedPrice < 100000))
);
CREATE INDEX IX_Products_Category ON dbo.Products (CategoryId);

-- Müşterinin aldığı ürünler (silinmez, pasife alınır).
CREATE TABLE dbo.CustomerProducts (
    CustomerProductId int           IDENTITY(1, 1) NOT NULL CONSTRAINT PK_CustomerProducts PRIMARY KEY,
    CustomerId        int           NOT NULL CONSTRAINT FK_CustomerProducts_Customers REFERENCES dbo.Customers (CustomerId),
    ProductId         int           NOT NULL CONSTRAINT FK_CustomerProducts_Products REFERENCES dbo.Products (ProductId),
    IsActive          bit           NOT NULL CONSTRAINT DF_CustomerProducts_IsActive DEFAULT (1),
    CreatedAt         smalldatetime NOT NULL CONSTRAINT DF_CustomerProducts_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT UQ_CustomerProducts UNIQUE (CustomerId, ProductId)
);
CREATE INDEX IX_CustomerProducts_Product ON dbo.CustomerProducts (ProductId);

-- Müşteri + ürün başına fiyat geçmişi. Fiyat yalnızca müşterinin ürününe girilebilir (bileşik FK).
CREATE TABLE dbo.CustomerPrices (
    CustomerPriceId int            IDENTITY(1, 1) NOT NULL CONSTRAINT PK_CustomerPrices PRIMARY KEY,
    CustomerId      int            NOT NULL CONSTRAINT FK_CustomerPrices_Customers REFERENCES dbo.Customers (CustomerId),
    ProductId       int            NOT NULL CONSTRAINT FK_CustomerPrices_Products REFERENCES dbo.Products (ProductId),
    Price           decimal(10, 2) NOT NULL,
    ValidFrom       smalldatetime  NOT NULL,
    CreatedAt       smalldatetime  NOT NULL CONSTRAINT DF_CustomerPrices_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CreatedBy       int            NULL CONSTRAINT FK_CustomerPrices_CreatedBy REFERENCES dbo.Users (UserId),
    CONSTRAINT FK_CustomerPrices_CustomerProducts FOREIGN KEY (CustomerId, ProductId) REFERENCES dbo.CustomerProducts (CustomerId, ProductId),
    -- (müşteri, ürün, tarih desc) fiyat aramasını da bu index karşılar.
    CONSTRAINT UQ_CustomerPrices UNIQUE (CustomerId, ProductId, ValidFrom),
    CONSTRAINT CK_CustomerPrices_Price CHECK (Price > 0 AND Price < 100000),
    CONSTRAINT CK_CustomerPrices_ValidFrom CHECK (ValidFrom = CONVERT(smalldatetime, CONVERT(date, ValidFrom)))
);
GO

/* -----------------------------------------------------------------------------
   Dağıtıcılar
----------------------------------------------------------------------------- */

CREATE TABLE dbo.Drivers (
    DriverId  int           IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Drivers PRIMARY KEY,
    Name      nvarchar(60)  NOT NULL,
    IsOwner   bit           NOT NULL CONSTRAINT DF_Drivers_IsOwner DEFAULT (0), -- işletme sahibinin kendi dağıtımı
    IsActive  bit           NOT NULL CONSTRAINT DF_Drivers_IsActive DEFAULT (1),
    SortOrder int           NOT NULL CONSTRAINT DF_Drivers_Sort DEFAULT (0),
    CreatedAt smalldatetime NOT NULL CONSTRAINT DF_Drivers_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT UQ_Drivers_Name UNIQUE (Name),
    CONSTRAINT CK_Drivers_Name CHECK (LEN(Name) >= 1 AND Name = LTRIM(RTRIM(Name)))
);
-- Yalnızca bir sahip dağıtıcı olabilir.
CREATE UNIQUE INDEX UX_Drivers_Owner ON dbo.Drivers (IsOwner) WHERE IsOwner = 1;
GO

/* -----------------------------------------------------------------------------
   Siparişler: müşteri + gün + dağıtıcı başına bir kayıt; tahsilat burada.
   Adet ve tutar alanları OrderLines'tan tetikleyiciyle toplanır.
----------------------------------------------------------------------------- */

CREATE TABLE dbo.Orders (
    OrderId      int            IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Orders PRIMARY KEY,
    CustomerId   int            NOT NULL CONSTRAINT FK_Orders_Customers REFERENCES dbo.Customers (CustomerId),
    DriverId     int            NOT NULL CONSTRAINT FK_Orders_Drivers REFERENCES dbo.Drivers (DriverId),
    EntryDate    smalldatetime  NOT NULL,
    SortOrder    int            NOT NULL CONSTRAINT DF_Orders_Sort DEFAULT (0),
    DeliveredQty int            NOT NULL CONSTRAINT DF_Orders_Delivered DEFAULT (0),
    ReturnedQty  int            NOT NULL CONSTRAINT DF_Orders_Returned DEFAULT (0),
    GrossAmount  decimal(14, 2) NOT NULL CONSTRAINT DF_Orders_Gross DEFAULT (0),
    ReturnAmount decimal(14, 2) NOT NULL CONSTRAINT DF_Orders_Return DEFAULT (0),
    NetAmount    decimal(14, 2) NOT NULL CONSTRAINT DF_Orders_Net DEFAULT (0),
    Collection   decimal(12, 2) NOT NULL CONSTRAINT DF_Orders_Collection DEFAULT (0),
    BalanceDelta AS (CONVERT(decimal(14, 2), NetAmount - Collection)) PERSISTED NOT NULL, -- + borç, − alacak
    Note         nvarchar(500)  NULL,
    CreatedAt    smalldatetime  NOT NULL CONSTRAINT DF_Orders_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CreatedBy    int            NULL CONSTRAINT FK_Orders_CreatedBy REFERENCES dbo.Users (UserId),
    UpdatedAt    smalldatetime  NOT NULL CONSTRAINT DF_Orders_UpdatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    UpdatedBy    int            NULL CONSTRAINT FK_Orders_UpdatedBy REFERENCES dbo.Users (UserId),
    CONSTRAINT CK_Orders_EntryDate CHECK (EntryDate = CONVERT(smalldatetime, CONVERT(date, EntryDate))),
    CONSTRAINT CK_Orders_Sort CHECK (SortOrder >= 0),
    CONSTRAINT CK_Orders_Qty CHECK (DeliveredQty >= 0 AND ReturnedQty >= 0),
    CONSTRAINT CK_Orders_Collection CHECK (Collection >= 0 AND Collection <= 9999999),
    CONSTRAINT CK_Orders_Note CHECK (Note IS NULL OR LEN(Note) >= 1)
);
-- Müşteri + gün + dağıtıcı tekil; INCLUDE sütunları bakiye toplamlarını tabloya gitmeden okutur.
CREATE UNIQUE INDEX UX_Orders_CustomerDayDriver ON dbo.Orders (CustomerId, EntryDate, DriverId)
    INCLUDE (BalanceDelta, NetAmount, Collection, DeliveredQty, ReturnedQty);
-- Günlük liste, hafta tablosu ve dönem toplamları.
CREATE INDEX IX_Orders_Day ON dbo.Orders (EntryDate, DriverId, SortOrder)
    INCLUDE (CustomerId, DeliveredQty, ReturnedQty, GrossAmount, ReturnAmount, NetAmount, Collection, BalanceDelta);

CREATE TABLE dbo.OrderLines (
    OrderLineId  int            IDENTITY(1, 1) NOT NULL CONSTRAINT PK_OrderLines PRIMARY KEY,
    OrderId      int            NOT NULL CONSTRAINT FK_OrderLines_Orders REFERENCES dbo.Orders (OrderId) ON DELETE CASCADE,
    ProductId    int            NOT NULL CONSTRAINT FK_OrderLines_Products REFERENCES dbo.Products (ProductId),
    DeliveredQty int            NOT NULL CONSTRAINT DF_OrderLines_Delivered DEFAULT (0),
    ReturnedQty  int            NOT NULL CONSTRAINT DF_OrderLines_Returned DEFAULT (0), -- önceki günün ekmeği de iade alınabilir: verilenden fazla olabilir
    UnitPrice    decimal(10, 2) NOT NULL CONSTRAINT DF_OrderLines_UnitPrice DEFAULT (0),
    GrossAmount  AS (CONVERT(decimal(14, 2), DeliveredQty * UnitPrice)) PERSISTED NOT NULL,
    ReturnAmount AS (CONVERT(decimal(14, 2), ReturnedQty * UnitPrice)) PERSISTED NOT NULL,
    NetAmount    AS (CONVERT(decimal(14, 2), (DeliveredQty - ReturnedQty) * UnitPrice)) PERSISTED NOT NULL,
    CreatedAt    smalldatetime  NOT NULL CONSTRAINT DF_OrderLines_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    UpdatedAt    smalldatetime  NOT NULL CONSTRAINT DF_OrderLines_UpdatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT CK_OrderLines_Qty CHECK (DeliveredQty BETWEEN 0 AND 100000 AND ReturnedQty BETWEEN 0 AND 100000),
    CONSTRAINT CK_OrderLines_UnitPrice CHECK (UnitPrice >= 0 AND UnitPrice < 100000)
);
CREATE UNIQUE INDEX UX_OrderLines_OrderProduct ON dbo.OrderLines (OrderId, ProductId)
    INCLUDE (DeliveredQty, ReturnedQty, UnitPrice, GrossAmount, ReturnAmount, NetAmount);
CREATE INDEX IX_OrderLines_Product ON dbo.OrderLines (ProductId)
    INCLUDE (OrderId, DeliveredQty, ReturnedQty, NetAmount);
GO

/* -----------------------------------------------------------------------------
   Dağıtıcı gün sonu, tezgah
----------------------------------------------------------------------------- */

CREATE TABLE dbo.DriverDays (
    DriverDayId int            IDENTITY(1, 1) NOT NULL CONSTRAINT PK_DriverDays PRIMARY KEY,
    EntryDate   smalldatetime  NOT NULL,
    DriverId    int            NOT NULL CONSTRAINT FK_DriverDays_Drivers REFERENCES dbo.Drivers (DriverId),
    HandedOver  decimal(12, 2) NULL, -- şoförün gün sonunda gerçekten teslim ettiği para
    Note        nvarchar(500)  NULL,
    UpdatedAt   smalldatetime  NOT NULL CONSTRAINT DF_DriverDays_UpdatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    UpdatedBy   int            NULL CONSTRAINT FK_DriverDays_UpdatedBy REFERENCES dbo.Users (UserId),
    CONSTRAINT UQ_DriverDays UNIQUE (EntryDate, DriverId),
    CONSTRAINT CK_DriverDays_EntryDate CHECK (EntryDate = CONVERT(smalldatetime, CONVERT(date, EntryDate))),
    CONSTRAINT CK_DriverDays_HandedOver CHECK (HandedOver IS NULL OR (HandedOver >= 0 AND HandedOver < 10000000))
);

CREATE TABLE dbo.CounterDays (
    CounterDayId int            IDENTITY(1, 1) NOT NULL CONSTRAINT PK_CounterDays PRIMARY KEY,
    EntryDate    smalldatetime  NOT NULL,
    SalesIncome  decimal(12, 2) NOT NULL CONSTRAINT DF_CounterDays_Sales DEFAULT (0), -- tezgahtan gelen ekmek parası
    OpeningCash  decimal(12, 2) NOT NULL CONSTRAINT DF_CounterDays_Opening DEFAULT (0),
    ClosingCash  decimal(12, 2) NOT NULL CONSTRAINT DF_CounterDays_Closing DEFAULT (0),
    HandedOver   decimal(12, 2) NULL,
    BreadsIn     int            NOT NULL CONSTRAINT DF_CounterDays_BreadsIn DEFAULT (0),
    BreadsLeft   int            NOT NULL CONSTRAINT DF_CounterDays_BreadsLeft DEFAULT (0),
    BreadPrice   decimal(10, 2) NULL,
    Note         nvarchar(500)  NULL,
    UpdatedAt    smalldatetime  NOT NULL CONSTRAINT DF_CounterDays_UpdatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    UpdatedBy    int            NULL CONSTRAINT FK_CounterDays_UpdatedBy REFERENCES dbo.Users (UserId),
    CONSTRAINT UQ_CounterDays_EntryDate UNIQUE (EntryDate),
    CONSTRAINT CK_CounterDays_EntryDate CHECK (EntryDate = CONVERT(smalldatetime, CONVERT(date, EntryDate))),
    CONSTRAINT CK_CounterDays_Money CHECK (
        SalesIncome >= 0 AND SalesIncome < 10000000 AND OpeningCash >= 0 AND OpeningCash < 10000000
        AND ClosingCash >= 0 AND ClosingCash < 10000000
        AND (HandedOver IS NULL OR (HandedOver >= 0 AND HandedOver < 10000000))
        AND (BreadPrice IS NULL OR (BreadPrice > 0 AND BreadPrice < 100000))),
    CONSTRAINT CK_CounterDays_Breads CHECK (BreadsIn BETWEEN 0 AND 100000 AND BreadsLeft BETWEEN 0 AND 100000)
);

-- Tezgahta satılan ek ürünler. Aynı gün + aynı ad + aynı fiyat tek satır (adet toplanır).
CREATE TABLE dbo.CounterSales (
    CounterSaleId int            IDENTITY(1, 1) NOT NULL CONSTRAINT PK_CounterSales PRIMARY KEY,
    EntryDate     smalldatetime  NOT NULL,
    ProductId     int            NULL CONSTRAINT FK_CounterSales_Products REFERENCES dbo.Products (ProductId), -- ad katalogla eşleşirse
    Name          nvarchar(60)   NOT NULL,
    Qty           decimal(10, 2) NOT NULL,
    UnitPrice     decimal(12, 2) NOT NULL,
    Amount        AS (CONVERT(decimal(14, 2), ROUND(Qty * UnitPrice, 2))) PERSISTED NOT NULL,
    CreatedAt     smalldatetime  NOT NULL CONSTRAINT DF_CounterSales_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CreatedBy     int            NULL CONSTRAINT FK_CounterSales_CreatedBy REFERENCES dbo.Users (UserId),
    UpdatedAt     smalldatetime  NOT NULL CONSTRAINT DF_CounterSales_UpdatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT UQ_CounterSales_DayItem UNIQUE (EntryDate, Name, UnitPrice),
    CONSTRAINT CK_CounterSales_EntryDate CHECK (EntryDate = CONVERT(smalldatetime, CONVERT(date, EntryDate))),
    CONSTRAINT CK_CounterSales_Name CHECK (LEN(Name) >= 1 AND Name = LTRIM(RTRIM(Name))),
    CONSTRAINT CK_CounterSales_Qty CHECK (Qty > 0 AND Qty < 100000),
    CONSTRAINT CK_CounterSales_UnitPrice CHECK (UnitPrice >= 0 AND UnitPrice < 1000000)
);
CREATE INDEX IX_CounterSales_Product ON dbo.CounterSales (ProductId, EntryDate) INCLUDE (Qty, Amount) WHERE ProductId IS NOT NULL;
GO

/* -----------------------------------------------------------------------------
   Giderler ve cari hareketler
     Gider (ExpenseKindId 1) + Peşin (PaymentMethodId 1)  : bakiye değişmez.
     Gider (1) + Cariye (2)                               : cari bizden ALACAKLI olur (bakiye −tutar).
     Cari ödeme (ExpenseKindId 2)                         : alacağı kapatır (bakiye +tutar), gider değildir.
----------------------------------------------------------------------------- */

CREATE TABLE dbo.ExpenseCategories (
    ExpenseCategoryId int           IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ExpenseCategories PRIMARY KEY,
    Name              nvarchar(40)  NOT NULL,
    SortOrder         int           NOT NULL CONSTRAINT DF_ExpenseCategories_Sort DEFAULT (50),
    IsActive          bit           NOT NULL CONSTRAINT DF_ExpenseCategories_IsActive DEFAULT (1), -- kaldırılan tür eski giderlerde kalır
    CreatedAt         smalldatetime NOT NULL CONSTRAINT DF_ExpenseCategories_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT UQ_ExpenseCategories_Name UNIQUE (Name),
    CONSTRAINT CK_ExpenseCategories_Name CHECK (LEN(Name) >= 1 AND Name = LTRIM(RTRIM(Name)))
);

CREATE TABLE dbo.Expenses (
    ExpenseId         int            IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Expenses PRIMARY KEY,
    EntryDate         smalldatetime  NOT NULL,
    ExpensePlaceId    int            NOT NULL CONSTRAINT FK_Expenses_Places REFERENCES dbo.ExpensePlaces (ExpensePlaceId),
    DriverId          int            NULL CONSTRAINT FK_Expenses_Drivers REFERENCES dbo.Drivers (DriverId),
    CustomerId        int            NULL CONSTRAINT FK_Expenses_Customers REFERENCES dbo.Customers (CustomerId),
    ExpenseKindId     int            NOT NULL CONSTRAINT DF_Expenses_Kind DEFAULT (1)
                                     CONSTRAINT FK_Expenses_Kinds REFERENCES dbo.ExpenseKinds (ExpenseKindId),
    PaymentMethodId   int            NOT NULL CONSTRAINT DF_Expenses_Payment DEFAULT (1)
                                     CONSTRAINT FK_Expenses_PaymentMethods REFERENCES dbo.PaymentMethods (PaymentMethodId),
    ExpenseCategoryId int            NULL CONSTRAINT FK_Expenses_Categories REFERENCES dbo.ExpenseCategories (ExpenseCategoryId),
    Amount            decimal(12, 2) NOT NULL,
    Description       nvarchar(200)  NULL,
    CreatedAt         smalldatetime  NOT NULL CONSTRAINT DF_Expenses_CreatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CreatedBy         int            NULL CONSTRAINT FK_Expenses_CreatedBy REFERENCES dbo.Users (UserId),
    UpdatedAt         smalldatetime  NOT NULL CONSTRAINT DF_Expenses_UpdatedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT CK_Expenses_EntryDate CHECK (EntryDate = CONVERT(smalldatetime, CONVERT(date, EntryDate))),
    CONSTRAINT CK_Expenses_Amount CHECK (Amount > 0 AND Amount < 10000000),
    CONSTRAINT CK_Expenses_Description CHECK (Description IS NULL OR LEN(Description) >= 1),
    -- Dağıtıcı gideri dağıtıcıyı ister; genel ve tezgah giderinde dağıtıcı olmaz.
    CONSTRAINT CK_Expenses_PlaceDriver CHECK ((ExpensePlaceId = 3 AND DriverId IS NOT NULL) OR (ExpensePlaceId IN (1, 2) AND DriverId IS NULL)),
    -- Cariye yazılan gider müşteri ister.
    CONSTRAINT CK_Expenses_AccountNeedsCustomer CHECK (PaymentMethodId = 1 OR CustomerId IS NOT NULL),
    -- Cari ödeme: müşteri şart, peşin, türsüz.
    CONSTRAINT CK_Expenses_PaymentNeedsCustomer CHECK (ExpenseKindId = 1 OR (CustomerId IS NOT NULL AND PaymentMethodId = 1 AND ExpenseCategoryId IS NULL))
);
CREATE INDEX IX_Expenses_Day ON dbo.Expenses (EntryDate, ExpensePlaceId, DriverId)
    INCLUDE (Amount, ExpenseKindId, PaymentMethodId, CustomerId, ExpenseCategoryId);
CREATE INDEX IX_Expenses_Customer ON dbo.Expenses (CustomerId, EntryDate)
    INCLUDE (Amount, ExpenseKindId, PaymentMethodId) WHERE CustomerId IS NOT NULL;
GO

/* -----------------------------------------------------------------------------
   Değişiklik kaydı (tetikleyiciler yazar; uygulama yalnızca okur)
----------------------------------------------------------------------------- */

CREATE TABLE dbo.AuditLog (
    AuditLogId    int           IDENTITY(1, 1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
    TableName     varchar(64)   NOT NULL,
    RecordId      varchar(40)   NULL,
    AuditActionId int           NOT NULL CONSTRAINT FK_AuditLog_Actions REFERENCES dbo.AuditActions (AuditActionId),
    OldData       nvarchar(max) NULL,
    NewData       nvarchar(max) NULL,
    ChangedBy     int           NULL CONSTRAINT FK_AuditLog_Users REFERENCES dbo.Users (UserId),
    ChangedAt     smalldatetime NOT NULL CONSTRAINT DF_AuditLog_ChangedAt DEFAULT (CONVERT(smalldatetime, SYSDATETIMEOFFSET() AT TIME ZONE 'Turkey Standard Time')),
    CONSTRAINT CK_AuditLog_OldJson CHECK (OldData IS NULL OR ISJSON(OldData) = 1),
    CONSTRAINT CK_AuditLog_NewJson CHECK (NewData IS NULL OR ISJSON(NewData) = 1)
);
CREATE INDEX IX_AuditLog_Record ON dbo.AuditLog (TableName, RecordId, AuditLogId);
CREATE INDEX IX_AuditLog_ChangedAt ON dbo.AuditLog (ChangedAt);
GO
