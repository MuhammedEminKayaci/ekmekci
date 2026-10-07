-- =============================================================================
-- Ekmek Satış — çekirdek şema
--   profiles         : uygulama kullanıcıları (auth.users ile 1-1)
--   customers        : müşteri kartları (isim benzersiz)
--   customer_prices  : müşteriye özel ekmek fiyatı geçmişi
--   orders           : müşteri + gün başına tek hareket satırı
--   app_settings     : tek satırlık uygulama ayarları (geçmiş hafta kilidi)
--   audit_log        : tüm değişikliklerin kaydı
--
-- Bakiye işareti: + müşteri borçlu, − müşteri alacaklı.
-- =============================================================================

create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Yardımcı fonksiyonlar
-- -----------------------------------------------------------------------------

-- İstanbul saatine göre bugün.
create or replace function private.today_tr()
returns date
language sql stable
set search_path = ''
as $$ select (pg_catalog.now() at time zone 'Europe/Istanbul')::date $$;

-- Verilen tarihin haftasının pazartesisi.
create or replace function private.week_start(d date)
returns date
language sql immutable parallel safe
set search_path = ''
as $$ select d - (extract(isodow from d)::int - 1) $$;

-- Mükerrer kontrolü için isim anahtarı: boşluklar sadeleşir, Türkçe büyük harf.
create or replace function private.normalize_name(p text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select pg_catalog.upper(
    pg_catalog.translate(
      pg_catalog.regexp_replace(pg_catalog.btrim(p), '\s+', ' ', 'g'),
      'iıçğöşü', 'İIÇĞÖŞÜ'
    )
  )
$$;

-- -----------------------------------------------------------------------------
-- Ayarlar (tek satır)
-- -----------------------------------------------------------------------------

create table public.app_settings (
  id              boolean primary key default true check (id),
  lock_past_weeks boolean not null default true,
  updated_at      timestamptz not null default now()
);

insert into public.app_settings default values;

-- Geçmiş hafta kilidi açıksa ve tarih bu haftadan önceyse true.
create or replace function private.is_locked(d date)
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((select lock_past_weeks from public.app_settings), true)
     and d < private.week_start(private.today_tr())
$$;

-- -----------------------------------------------------------------------------
-- Kullanıcılar
-- -----------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '' check (char_length(full_name) <= 100),
  role       text not null default 'user' check (role in ('admin', 'user')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Yeni auth kullanıcısı için profil açar; ilk kullanıcı admin olur.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), ''),
    case when exists (select 1 from public.profiles) then 'user' else 'admin' end
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Müşteriler
-- -----------------------------------------------------------------------------

create table public.customers (
  id         bigint generated always as identity primary key,
  type       smallint not null check (type in (1, 2)), -- 1 şahıs, 2 kurumsal
  name       text not null check (char_length(name) between 1 and 120),
  name_key   text generated always as (private.normalize_name(name)) stored,
  address    text check (char_length(address) <= 500),
  note       text check (char_length(note) <= 1000),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint customers_name_unique unique (name_key)
);

comment on column public.customers.type is '1 = şahıs, 2 = kurumsal';

create or replace function private.customers_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := pg_catalog.regexp_replace(pg_catalog.btrim(new.name), '\s+', ' ', 'g');
  new.address := nullif(pg_catalog.btrim(new.address), '');
  new.note := nullif(pg_catalog.btrim(new.note), '');
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger customers_10_before_write
  before insert or update on public.customers
  for each row execute function private.customers_before_write();

-- -----------------------------------------------------------------------------
-- Fiyat geçmişi
-- -----------------------------------------------------------------------------

create table public.customer_prices (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references public.customers (id) on delete restrict,
  price       numeric(10, 2) not null check (price > 0),
  valid_from  date not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  -- (customer_id, valid_from desc) aramasını da bu indeks karşılar.
  constraint customer_prices_customer_day_unique unique (customer_id, valid_from)
);

-- Müşterinin belirli bir gündeki geçerli fiyatı; yoksa hata.
create or replace function private.price_on(p_customer_id bigint, p_date date)
returns numeric
language plpgsql stable
set search_path = ''
as $$
declare
  v_price numeric;
begin
  select cp.price into v_price
  from public.customer_prices cp
  where cp.customer_id = p_customer_id and cp.valid_from <= p_date
  order by cp.valid_from desc
  limit 1;

  if v_price is null then
    raise exception 'Müşterinin % tarihinde geçerli bir ekmek fiyatı yok.', p_date
      using errcode = 'P0001', hint = 'price_missing';
  end if;
  return v_price;
end
$$;

create or replace function private.customer_prices_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and private.is_locked(old.valid_from) then
    raise exception 'Geçmiş haftalara ait fiyat değiştirilemez.'
      using errcode = 'P0001', hint = 'week_locked';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and private.is_locked(new.valid_from) then
    raise exception 'Fiyat geçmiş bir haftadan başlatılamaz.'
      using errcode = 'P0001', hint = 'week_locked';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.customer_id <> old.customer_id then
      raise exception 'Fiyat kaydının müşterisi değiştirilemez.' using errcode = 'P0001';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

-- Fiyat değişince, kilitli olmayan ve etkilenen siparişlerin fiyatını yeniler.
create or replace function private.customer_prices_after_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_customer_id bigint := coalesce(new.customer_id, old.customer_id);
  v_from date := least(coalesce(new.valid_from, old.valid_from), coalesce(old.valid_from, new.valid_from));
begin
  -- orders tetikleyicisi unit_price'ı fiyat tablosundan yeniden hesaplar.
  update public.orders o
     set unit_price = o.unit_price
   where o.customer_id = v_customer_id
     and o.entry_date >= v_from
     and not private.is_locked(o.entry_date);
  return null;
end
$$;

create trigger customer_prices_10_before_write
  before insert or update or delete on public.customer_prices
  for each row execute function private.customer_prices_before_write();

create trigger customer_prices_20_after_write
  after insert or update or delete on public.customer_prices
  for each row execute function private.customer_prices_after_write();

-- -----------------------------------------------------------------------------
-- Siparişler (günlük hareketler)
-- -----------------------------------------------------------------------------

create table public.orders (
  id            bigint generated always as identity primary key,
  customer_id   bigint not null references public.customers (id) on delete restrict,
  entry_date    date not null,
  delivered_qty integer not null default 0 check (delivered_qty between 0 and 100000),
  returned_qty  integer not null default 0 check (returned_qty between 0 and 100000),
  unit_price    numeric(10, 2) not null default 0 check (unit_price >= 0),
  collection    numeric(12, 2) not null default 0 check (collection between 0 and 9999999),
  gross_amount  numeric(14, 2) generated always as (delivered_qty * unit_price) stored,
  return_amount numeric(14, 2) generated always as (returned_qty * unit_price) stored,
  net_amount    numeric(14, 2) generated always as ((delivered_qty - returned_qty) * unit_price) stored,
  balance_delta numeric(14, 2) generated always as ((delivered_qty - returned_qty) * unit_price - collection) stored,
  note          text check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  updated_by    uuid references public.profiles (id) on delete set null,
  -- Müşteri + gün tekil; INCLUDE sütunları bakiye toplamlarını tabloya gitmeden okutur.
  constraint orders_customer_day_unique unique (customer_id, entry_date)
    include (balance_delta, net_amount, collection, delivered_qty, returned_qty)
);

create index orders_entry_date_idx on public.orders (entry_date);

comment on column public.orders.balance_delta is 'Net tutar − tahsilat. + borç, − alacak.';

create or replace function private.orders_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and private.is_locked(old.entry_date) then
    raise exception 'Geçmiş haftaların kayıtları değiştirilemez.'
      using errcode = 'P0001', hint = 'week_locked';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and private.is_locked(new.entry_date) then
    raise exception 'Geçmiş bir haftaya kayıt girilemez.'
      using errcode = 'P0001', hint = 'week_locked';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not exists (select 1 from public.customers c where c.id = new.customer_id and c.is_active) then
      raise exception 'Pasif müşteriye kayıt girilemez.'
        using errcode = 'P0001', hint = 'customer_inactive';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  -- Fiyat istemciden alınmaz, her zaman fiyat geçmişinden gelir.
  new.unit_price := private.price_on(new.customer_id, new.entry_date);
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;

create trigger orders_10_before_write
  before insert or update or delete on public.orders
  for each row execute function private.orders_before_write();

-- -----------------------------------------------------------------------------
-- Profiller ve ayarlar için updated_at
-- -----------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger profiles_10_touch
  before update on public.profiles
  for each row execute function private.touch_updated_at();

create trigger app_settings_10_touch
  before update on public.app_settings
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Denetim kaydı
-- -----------------------------------------------------------------------------

create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  text,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data   jsonb,
  new_data   jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (table_name, record_id, changed_at desc);
create index audit_log_changed_at_idx on public.audit_log (changed_at desc);

create or replace function private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Değişmeyen satırlar (ör. fiyat yenilemede aynı kalanlar) kaydedilmez.
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'updated_at' - 'updated_by') = (to_jsonb(new) - 'updated_at' - 'updated_by') then
    return null;
  end if;

  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then to_jsonb(old) ->> 'id' else to_jsonb(new) ->> 'id' end,
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid()
  );
  return null;
end
$$;

create trigger customers_90_audit
  after insert or update or delete on public.customers
  for each row execute function private.audit();

create trigger customer_prices_90_audit
  after insert or update or delete on public.customer_prices
  for each row execute function private.audit();

create trigger orders_90_audit
  after insert or update or delete on public.orders
  for each row execute function private.audit();

create trigger profiles_90_audit
  after insert or update or delete on public.profiles
  for each row execute function private.audit();

create trigger app_settings_90_audit
  after update on public.app_settings
  for each row execute function private.audit();
