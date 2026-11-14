-- =============================================================================
-- Ürünler: farklı ekmek çeşitleri ve diğer ürünler.
--
-- * products            : ürün kataloğu (öneri fiyatı isteğe bağlı)
-- * customer_products   : müşterinin aldığı ürünler
-- * customer_prices     : artık müşteri + ürün başına fiyat geçmişi
-- * order_lines         : siparişin ürün satırları (verilen, iade, o günkü fiyat)
-- * orders              : müşteri + gün + dağıtıcı; alınan para burada.
--                         Adet/tutar/bakiye alanları satırlardan otomatik toplanır.
--
-- Mevcut bütün kayıtlar "Ekmek" ürününe aktarılır; hiçbir tutar değişmez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Ürünler
-- -----------------------------------------------------------------------------

create table public.products (
  id            bigint generated always as identity primary key,
  name          text not null check (char_length(name) between 1 and 60),
  name_key      text generated always as (private.normalize_name(name)) stored,
  unit          text not null default 'adet' check (char_length(unit) between 1 and 12),
  suggested_price numeric(10, 2) check (suggested_price > 0 and suggested_price < 100000),
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint products_name_unique unique (name_key)
);

comment on column public.products.suggested_price is 'Ürün müşteriye eklenirken öneri fiyat; asıl fiyat müşteriye özeldir.';

insert into public.products (name, sort_order) values ('Ekmek', 1);

create or replace function private.default_product_id()
returns bigint
language sql stable
set search_path = ''
as $$ select id from public.products where name_key = private.normalize_name('Ekmek') $$;

-- -----------------------------------------------------------------------------
-- 2) Müşterinin ürünleri
-- -----------------------------------------------------------------------------

create table public.customer_products (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references public.customers (id) on delete restrict,
  product_id  bigint not null references public.products (id) on delete restrict,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint customer_products_unique unique (customer_id, product_id)
);

create index customer_products_product_idx on public.customer_products (product_id);

insert into public.customer_products (customer_id, product_id)
select distinct cp.customer_id, private.default_product_id() from public.customer_prices cp;

-- -----------------------------------------------------------------------------
-- 3) Fiyat geçmişi ürün bazında
-- -----------------------------------------------------------------------------

alter table public.customer_prices add column product_id bigint references public.products (id) on delete restrict;

alter table public.customer_prices disable trigger user;
update public.customer_prices set product_id = private.default_product_id() where product_id is null;
alter table public.customer_prices enable trigger user;

alter table public.customer_prices alter column product_id set not null;
alter table public.customer_prices drop constraint customer_prices_customer_day_unique;
alter table public.customer_prices
  add constraint customer_prices_customer_product_day_unique unique (customer_id, product_id, valid_from);

-- Müşterinin bir ürün için belirli bir gündeki fiyatı; yoksa hata.
create or replace function private.price_on(p_customer_id bigint, p_product_id bigint, p_date date)
returns numeric
language plpgsql stable
set search_path = ''
as $$
declare
  v_price numeric;
begin
  select cp.price into v_price
  from public.customer_prices cp
  where cp.customer_id = p_customer_id and cp.product_id = p_product_id and cp.valid_from <= p_date
  order by cp.valid_from desc
  limit 1;

  if v_price is null then
    raise exception 'Bu müşterinin bu ürün için % tarihinde geçerli bir fiyatı yok. Müşteri kartından ürüne fiyat girin.', p_date
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
    if new.customer_id <> old.customer_id or new.product_id <> old.product_id then
      raise exception 'Fiyat kaydının müşterisi ve ürünü değiştirilemez.' using errcode = 'P0001';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- 4) Sipariş satırları
-- -----------------------------------------------------------------------------

create table public.order_lines (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references public.orders (id) on delete cascade,
  product_id    bigint not null references public.products (id) on delete restrict,
  delivered_qty integer not null default 0 check (delivered_qty between 0 and 100000),
  returned_qty  integer not null default 0 check (returned_qty between 0 and 100000),
  unit_price    numeric(10, 2) not null default 0 check (unit_price >= 0),
  gross_amount  numeric(14, 2) generated always as (delivered_qty * unit_price) stored,
  return_amount numeric(14, 2) generated always as (returned_qty * unit_price) stored,
  net_amount    numeric(14, 2) generated always as ((delivered_qty - returned_qty) * unit_price) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint order_lines_order_product_unique unique (order_id, product_id)
);

create index order_lines_product_idx on public.order_lines (product_id);

-- Siparişin adet/tutar alanları artık satırlardan toplanır: hesaplanan sütundan normal sütuna.
alter table public.orders alter column gross_amount drop expression;
alter table public.orders alter column return_amount drop expression;
alter table public.orders alter column net_amount drop expression;
alter table public.orders alter column balance_delta drop expression;
comment on column public.orders.unit_price is 'Eski tek-ürün dönemi fiyatı; yeni hesaplar order_lines.unit_price kullanır.';

-- Mevcut her sipariş bir "Ekmek" satırı olur (aynı adet ve aynı fiyat).
insert into public.order_lines (order_id, product_id, delivered_qty, returned_qty, unit_price, created_at, updated_at)
select o.id, private.default_product_id(), o.delivered_qty, o.returned_qty, o.unit_price, o.created_at, o.updated_at
from public.orders o;

-- -----------------------------------------------------------------------------
-- 5) Tetikleyiciler
-- -----------------------------------------------------------------------------

-- Sipariş: anahtarlar değişmez; adet ve tutarlar her yazımda satırlardan yeniden toplanır.
create or replace function private.orders_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v record;
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
    if not exists (select 1 from public.drivers d where d.id = new.driver_id and d.is_active) then
      raise exception 'Pasif dağıtıcıya kayıt girilemez.'
        using errcode = 'P0001', hint = 'driver_inactive';
    end if;
    if new.sort_order = 0 then
      new.sort_order := coalesce(
        (select max(o.sort_order) from public.orders o
          where o.entry_date = new.entry_date and o.driver_id = new.driver_id), 0
      ) + 1;
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.delivered_qty := 0;
    new.returned_qty := 0;
    new.gross_amount := 0;
    new.return_amount := 0;
    new.net_amount := 0;
  else
    if new.driver_id <> old.driver_id
       or new.customer_id <> old.customer_id
       or new.entry_date <> old.entry_date then
      raise exception 'Kaydın müşterisi, günü ve dağıtıcısı değiştirilemez; satırı silip doğru yere ekleyin.'
        using errcode = 'P0001', hint = 'immutable_keys';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    select coalesce(sum(l.delivered_qty), 0)::int d, coalesce(sum(l.returned_qty), 0)::int r,
           coalesce(sum(l.gross_amount), 0) g, coalesce(sum(l.return_amount), 0) ra, coalesce(sum(l.net_amount), 0) n
      into v
      from public.order_lines l where l.order_id = new.id;
    new.delivered_qty := v.d;
    new.returned_qty := v.r;
    new.gross_amount := v.g;
    new.return_amount := v.ra;
    new.net_amount := v.n;
  end if;

  new.balance_delta := new.net_amount - new.collection;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;

-- Satır: geçmiş hafta kilidi, ürün/sipariş değişmez, fiyat her zaman müşterinin o günkü ürün fiyatı.
create or replace function private.order_lines_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order record;
begin
  select o.customer_id, o.entry_date into v_order
  from public.orders o where o.id = coalesce(new.order_id, old.order_id);

  -- Sipariş silinirken satırlar da silinir (cascade); o anda sipariş artık görünmez.
  if tg_op = 'DELETE' then
    if v_order.entry_date is not null and private.is_locked(v_order.entry_date) then
      raise exception 'Geçmiş haftaların kayıtları değiştirilemez.'
        using errcode = 'P0001', hint = 'week_locked';
    end if;
    return old;
  end if;

  if private.is_locked(v_order.entry_date) then
    raise exception 'Geçmiş haftaların kayıtları değiştirilemez.'
      using errcode = 'P0001', hint = 'week_locked';
  end if;

  if tg_op = 'INSERT' then
    if not exists (select 1 from public.products p where p.id = new.product_id and p.is_active) then
      raise exception 'Pasif ürün eklenemez.' using errcode = 'P0001', hint = 'product_inactive';
    end if;
    new.created_at := now();
  else
    if new.order_id <> old.order_id or new.product_id <> old.product_id then
      raise exception 'Satırın siparişi ve ürünü değiştirilemez.' using errcode = 'P0001', hint = 'immutable_keys';
    end if;
    new.created_at := old.created_at;
  end if;

  new.unit_price := private.price_on(v_order.customer_id, new.product_id, v_order.entry_date);
  new.updated_at := now();
  return new;
end
$$;

-- Satır değişince siparişin toplamları yeniden hesaplansın.
create or replace function private.order_lines_after_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.orders o set updated_at = now() where o.id = coalesce(new.order_id, old.order_id);
  return null;
end
$$;

create trigger order_lines_10_before_write
  before insert or update or delete on public.order_lines
  for each row execute function private.order_lines_before_write();

create trigger order_lines_20_after_write
  after insert or update or delete on public.order_lines
  for each row execute function private.order_lines_after_write();

create trigger order_lines_90_audit
  after insert or update or delete on public.order_lines
  for each row execute function private.audit();

create trigger products_90_audit
  after insert or update or delete on public.products
  for each row execute function private.audit();

create trigger customer_products_90_audit
  after insert or update or delete on public.customer_products
  for each row execute function private.audit();

-- Fiyat değişince etkilenen (kilitli olmayan) satırların fiyatı yenilenir.
create or replace function private.customer_prices_after_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_customer_id bigint := coalesce(new.customer_id, old.customer_id);
  v_product_id  bigint := coalesce(new.product_id, old.product_id);
  v_from date := least(coalesce(new.valid_from, old.valid_from), coalesce(old.valid_from, new.valid_from));
begin
  update public.order_lines l
     set unit_price = l.unit_price
    from public.orders o
   where l.order_id = o.id
     and o.customer_id = v_customer_id
     and l.product_id = v_product_id
     and o.entry_date >= v_from
     and not private.is_locked(o.entry_date);
  return null;
end
$$;

-- Eski 2 parametreli fiyat fonksiyonu artık kullanılmıyor.
drop function if exists private.price_on(bigint, date);

-- -----------------------------------------------------------------------------
-- 6) API
-- -----------------------------------------------------------------------------

drop function if exists public.create_customer(smallint, text, numeric, text, text);
drop function if exists public.set_customer_price(bigint, numeric, date);

-- Müşteri + ürünleri ve fiyatları tek işlemde. p_products: [{"product_id": 1, "price": 45}]
create or replace function public.create_customer(
  p_type smallint,
  p_name text,
  p_products jsonb,
  p_address text default null,
  p_note text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
  v_item jsonb;
begin
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0 then
    raise exception 'En az bir ürün ve fiyat girin.' using errcode = 'P0001';
  end if;

  insert into public.customers (type, name, address, note)
  values (p_type, p_name, p_address, p_note)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_products) loop
    insert into public.customer_products (customer_id, product_id)
    values (v_id, (v_item ->> 'product_id')::bigint);
    -- İlk fiyat bu haftanın başından geçerli: hafta içi önceki günler de girilebilir.
    insert into public.customer_prices (customer_id, product_id, price, valid_from)
    values (v_id, (v_item ->> 'product_id')::bigint, (v_item ->> 'price')::numeric, private.week_start(private.today_tr()));
  end loop;

  return v_id;
end
$$;

-- Müşteriye ürün ekler ya da ürünün fiyatını değiştirir (aynı gün tekrar girilirse günceller).
create or replace function public.set_customer_price(
  p_customer_id bigint,
  p_product_id bigint,
  p_price numeric,
  p_valid_from date default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from date := coalesce(p_valid_from, private.today_tr());
begin
  insert into public.customer_products (customer_id, product_id)
  values (p_customer_id, p_product_id)
  on conflict (customer_id, product_id) do update set is_active = true;

  -- Ürün müşteriye ilk kez ekleniyorsa fiyat bu haftanın başından geçerli olsun.
  if not exists (select 1 from public.customer_prices cp where cp.customer_id = p_customer_id and cp.product_id = p_product_id) then
    v_from := least(v_from, private.week_start(private.today_tr()));
  end if;

  insert into public.customer_prices (customer_id, product_id, price, valid_from)
  values (p_customer_id, p_product_id, p_price, v_from)
  on conflict (customer_id, product_id, valid_from) do update set price = excluded.price;
end
$$;

-- Müşteri listesi: bakiye + aktif ürünleri ve güncel fiyatları.
drop view public.customer_overview;

create view public.customer_overview
with (security_invoker = true) as
select
  c.id,
  c.type,
  c.name,
  c.address,
  c.note,
  c.is_active,
  c.created_at,
  coalesce(b.balance, 0)::numeric(14, 2) as balance,
  b.last_entry_date,
  coalesce(pr.products, '[]'::jsonb) as products
from public.customers c
left join lateral (
  select sum(o.balance_delta) as balance, max(o.entry_date) as last_entry_date
  from public.orders o
  where o.customer_id = c.id
) b on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object('product_id', p.id, 'name', p.name, 'unit', p.unit, 'price', cur.price, 'since', cur.valid_from)
           order by p.sort_order, p.name_key
         ) as products
  from public.customer_products cpr
  join public.products p on p.id = cpr.product_id
  left join lateral (
    select cp.price, cp.valid_from
    from public.customer_prices cp
    where cp.customer_id = c.id and cp.product_id = p.id and cp.valid_from <= private.today_tr()
    order by cp.valid_from desc
    limit 1
  ) cur on true
  where cpr.customer_id = c.id and cpr.is_active and p.is_active
) pr on true;

-- Haftanın sipariş satırları (ürün bazında).
create or replace function public.get_week_lines(p_date date)
returns table (
  id            bigint,
  order_id      bigint,
  product_id    bigint,
  product_name  text,
  product_unit  text,
  delivered_qty integer,
  returned_qty  integer,
  unit_price    numeric,
  net_amount    numeric
)
language sql stable
security invoker
set search_path = ''
as $$
  select l.id, l.order_id, l.product_id, p.name, p.unit, l.delivered_qty, l.returned_qty, l.unit_price, l.net_amount
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  join public.products p on p.id = l.product_id
  where o.entry_date between private.week_start(p_date) and private.week_start(p_date) + 6
  order by l.order_id, p.sort_order, p.name_key;
$$;

-- Ürün bazında günlük satış (ürünler sayfası).
create or replace function public.get_product_daily(p_from date, p_to date)
returns table (
  entry_date    date,
  product_id    bigint,
  delivered_qty bigint,
  returned_qty  bigint,
  net_amount    numeric,
  customers     bigint
)
language sql stable
security invoker
set search_path = ''
as $$
  select o.entry_date, l.product_id,
         sum(l.delivered_qty)::bigint, sum(l.returned_qty)::bigint, sum(l.net_amount),
         count(distinct o.customer_id)
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  where o.entry_date between p_from and p_to
  group by 1, 2
  order by 1, 2;
$$;

-- -----------------------------------------------------------------------------
-- 7) Güvenlik
-- -----------------------------------------------------------------------------

revoke all on public.products, public.customer_products, public.order_lines from anon;
revoke truncate, references, trigger on public.products, public.customer_products, public.order_lines from authenticated;

alter table public.products          enable row level security;
alter table public.customer_products enable row level security;
alter table public.order_lines       enable row level security;

create policy "products: aktif kullanıcı okur" on public.products
  for select to authenticated using ((select private.is_active_user()));
create policy "products: yönetici ekler" on public.products
  for insert to authenticated with check ((select private.is_admin()));
create policy "products: yönetici günceller" on public.products
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "customer_products: aktif kullanıcı okur" on public.customer_products
  for select to authenticated using ((select private.is_active_user()));
create policy "customer_products: aktif kullanıcı ekler" on public.customer_products
  for insert to authenticated with check ((select private.is_active_user()));
create policy "customer_products: aktif kullanıcı günceller" on public.customer_products
  for update to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()));

create policy "order_lines: aktif kullanıcı okur" on public.order_lines
  for select to authenticated using ((select private.is_active_user()));
create policy "order_lines: aktif kullanıcı ekler" on public.order_lines
  for insert to authenticated with check ((select private.is_active_user()));
create policy "order_lines: aktif kullanıcı günceller" on public.order_lines
  for update to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()));
create policy "order_lines: aktif kullanıcı siler" on public.order_lines
  for delete to authenticated using ((select private.is_active_user()));

-- Ürün ve müşteri-ürün kayıtları silinmez (pasife alınır).
revoke delete on public.products, public.customer_products from authenticated;

revoke execute on function
  private.price_on(bigint, bigint, date), private.default_product_id(),
  private.order_lines_before_write(), private.order_lines_after_write()
from public, anon;
grant execute on function private.price_on(bigint, bigint, date), private.default_product_id() to authenticated;

revoke all on function
  public.create_customer(smallint, text, jsonb, text, text),
  public.set_customer_price(bigint, bigint, numeric, date),
  public.get_week_lines(date),
  public.get_product_daily(date, date)
from public, anon;
grant execute on function
  public.create_customer(smallint, text, jsonb, text, text),
  public.set_customer_price(bigint, bigint, numeric, date),
  public.get_week_lines(date),
  public.get_product_daily(date, date)
to authenticated;

revoke all on public.customer_overview from anon;
revoke insert, update, delete, truncate, references, trigger on public.customer_overview from authenticated;
grant select on public.customer_overview to authenticated;

-- -----------------------------------------------------------------------------
-- 8) Günlük yedeğe yeni tablolar
-- -----------------------------------------------------------------------------

create or replace function yedek.al()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gun date := (now() at time zone 'Europe/Istanbul')::date;
  v_id  bigint;
begin
  insert into yedek.gunluk (gun, musteri_sayisi, siparis_sayisi, fiyat_sayisi, bakiye, veri)
  select
    v_gun,
    (select count(*) from public.customers),
    (select count(*) from public.orders),
    (select count(*) from public.customer_prices),
    (select coalesce(sum(o.balance_delta), 0) from public.orders o),
    jsonb_build_object(
      'surum', 3,
      'customers',         (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customers t),
      'products',          (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.products t),
      'customer_products', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customer_products t),
      'customer_prices',   (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customer_prices t),
      'orders',            (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.orders t),
      'order_lines',       (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.order_lines t),
      'drivers',           (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.drivers t),
      'expenses',          (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.expenses t),
      'driver_days',       (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.driver_days t),
      'counter_days',      (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.counter_days t),
      'profiles',          (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.profiles t),
      'app_settings',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.app_settings t)
    )
  on conflict (gun) do update
    set alindi         = now(),
        musteri_sayisi = excluded.musteri_sayisi,
        siparis_sayisi = excluded.siparis_sayisi,
        fiyat_sayisi   = excluded.fiyat_sayisi,
        bakiye         = excluded.bakiye,
        veri           = excluded.veri
  returning id into v_id;

  delete from yedek.gunluk where gun < v_gun - 60;
  return v_id;
end
$$;

revoke all on function yedek.al() from public, anon, authenticated;
