-- =============================================================================
-- Dağıtıcılar (Ben / şoförler), şoför gün sonu, giderler ve tezgah.
--
-- * Bir müşteriye aynı gün birden fazla dağıtıcı ekmek götürebilir: sipariş satırı
--   artık müşteri + gün + dağıtıcı başına tekildir. Müşteri bakiyesi yine bütün
--   satırların toplamıdır; dağıtıcı yalnızca kimin götürdüğünü/topladığını gösterir.
-- * Mevcut bütün siparişler "Ben" dağıtıcısına atanır; hiçbir tutar değişmez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Dağıtıcılar
-- -----------------------------------------------------------------------------

create table public.drivers (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 60),
  name_key   text generated always as (private.normalize_name(name)) stored,
  is_owner   boolean not null default false, -- "Ben": işletme sahibinin kendi dağıtımı
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint drivers_name_unique unique (name_key)
);

-- Yalnızca bir "Ben" olabilir.
create unique index drivers_one_owner on public.drivers (is_owner) where is_owner;

comment on table public.drivers is 'Ekmeği dağıtan kişiler: işletme sahibi (Ben) ve şoförler.';

insert into public.drivers (name, is_owner, sort_order) values
  ('Ben', true, 1),
  ('Ömer', false, 2),
  ('Efe', false, 3);

create or replace function private.owner_driver_id()
returns bigint
language sql stable
set search_path = ''
as $$ select id from public.drivers where is_owner $$;

-- -----------------------------------------------------------------------------
-- Siparişlere dağıtıcı
-- -----------------------------------------------------------------------------

alter table public.orders add column driver_id bigint references public.drivers (id) on delete restrict;

-- Tek seferlik atama; geçmiş hafta kilidi ve değişiklik kaydı bu işlemi etkilemesin.
alter table public.orders disable trigger user;
update public.orders set driver_id = private.owner_driver_id() where driver_id is null;
alter table public.orders enable trigger user;

alter table public.orders alter column driver_id set not null;
alter table public.orders alter column driver_id set default private.owner_driver_id();

alter table public.orders drop constraint orders_customer_day_unique;
alter table public.orders add constraint orders_customer_day_driver_unique
  unique (customer_id, entry_date, driver_id)
  include (balance_delta, net_amount, collection, delivered_qty, returned_qty);

create index orders_day_driver_idx on public.orders (entry_date, driver_id, sort_order);

-- Sıra artık her dağıtıcının kendi gün listesi içinde.
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
  else
    if new.driver_id <> old.driver_id then
      raise exception 'Kaydın dağıtıcısı değiştirilemez; satırı silip doğru dağıtıcıya ekleyin.'
        using errcode = 'P0001';
    end if;
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

drop function public.get_week_board(date);

create function public.get_week_board(p_date date)
returns table (
  id            bigint,
  customer_id   bigint,
  customer_name text,
  customer_type smallint,
  driver_id     bigint,
  entry_date    date,
  sort_order    integer,
  delivered_qty integer,
  returned_qty  integer,
  unit_price    numeric,
  gross_amount  numeric,
  return_amount numeric,
  net_amount    numeric,
  collection    numeric,
  balance_delta numeric,
  note          text,
  is_locked     boolean
)
language sql stable
security invoker
set search_path = ''
as $$
  select o.id, o.customer_id, c.name, c.type, o.driver_id, o.entry_date, o.sort_order,
         o.delivered_qty, o.returned_qty, o.unit_price,
         o.gross_amount, o.return_amount, o.net_amount, o.collection, o.balance_delta,
         o.note, private.is_locked(o.entry_date)
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.entry_date between private.week_start(p_date) and private.week_start(p_date) + 6
  order by o.entry_date, o.driver_id, o.sort_order, c.name_key;
$$;

-- -----------------------------------------------------------------------------
-- Giderler (şoför ya da tezgah)
-- -----------------------------------------------------------------------------

create table public.expenses (
  id          bigint generated always as identity primary key,
  entry_date  date not null,
  place       text not null check (place in ('driver', 'counter')),
  driver_id   bigint references public.drivers (id) on delete restrict,
  amount      numeric(12, 2) not null check (amount > 0 and amount < 10000000),
  category    text check (char_length(category) <= 40),
  description text check (char_length(description) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  constraint expenses_owner_check check (
    (place = 'driver' and driver_id is not null) or (place = 'counter' and driver_id is null)
  )
);

create index expenses_day_idx on public.expenses (entry_date, place, driver_id);

comment on table public.expenses is 'Gün içi harcamalar: şoför (mazot vb.) ya da tezgah.';

-- -----------------------------------------------------------------------------
-- Şoför gün sonu (teslim alınan para)
-- -----------------------------------------------------------------------------

create table public.driver_days (
  id          bigint generated always as identity primary key,
  entry_date  date not null,
  driver_id   bigint not null references public.drivers (id) on delete restrict,
  handed_over numeric(12, 2) check (handed_over >= 0 and handed_over < 10000000),
  note        text check (char_length(note) <= 500),
  updated_at  timestamptz not null default now(),
  constraint driver_days_unique unique (entry_date, driver_id)
);

comment on column public.driver_days.handed_over is 'Şoförün gün sonunda gerçekten teslim ettiği para.';

-- -----------------------------------------------------------------------------
-- Tezgah
-- -----------------------------------------------------------------------------

alter table public.app_settings
  add column counter_bread_price numeric(10, 2) check (counter_bread_price > 0);

create table public.counter_days (
  id            bigint generated always as identity primary key,
  entry_date    date not null unique,
  opening_cash  numeric(12, 2) not null default 0 check (opening_cash >= 0),
  breads_in     integer not null default 0 check (breads_in between 0 and 100000),
  breads_left   integer not null default 0 check (breads_left between 0 and 100000),
  bread_price   numeric(10, 2) check (bread_price > 0),
  sales_income  numeric(12, 2) not null default 0 check (sales_income >= 0),
  closing_cash  numeric(12, 2) not null default 0 check (closing_cash >= 0),
  handed_over   numeric(12, 2) check (handed_over >= 0),
  note          text check (char_length(note) <= 500),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null
);

comment on table public.counter_days is 'Tezgah gün sonu: kasa açılış/kapanış, ekmek sayımı, gelen para.';

-- -----------------------------------------------------------------------------
-- Ortak tetikleyiciler: geçmiş hafta kilidi + zaman damgası
-- -----------------------------------------------------------------------------

create or replace function private.day_rows_before_write()
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
  new.updated_at := now();
  return new;
end
$$;

create or replace function private.expenses_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

create or replace function private.counter_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' and new.bread_price is null then
    new.bread_price := (select s.counter_bread_price from public.app_settings s);
  end if;
  return new;
end
$$;

create trigger expenses_10_before_write
  before insert or update or delete on public.expenses
  for each row execute function private.day_rows_before_write();
create trigger expenses_20_stamp
  before insert or update on public.expenses
  for each row execute function private.expenses_stamp();

create trigger driver_days_10_before_write
  before insert or update or delete on public.driver_days
  for each row execute function private.day_rows_before_write();

create trigger counter_days_10_before_write
  before insert or update or delete on public.counter_days
  for each row execute function private.day_rows_before_write();
create trigger counter_days_20_stamp
  before insert or update on public.counter_days
  for each row execute function private.counter_stamp();

create trigger drivers_90_audit
  after insert or update or delete on public.drivers
  for each row execute function private.audit();
create trigger expenses_90_audit
  after insert or update or delete on public.expenses
  for each row execute function private.audit();
create trigger driver_days_90_audit
  after insert or update or delete on public.driver_days
  for each row execute function private.audit();
create trigger counter_days_90_audit
  after insert or update or delete on public.counter_days
  for each row execute function private.audit();

-- -----------------------------------------------------------------------------
-- Güvenlik
-- -----------------------------------------------------------------------------

revoke all on public.drivers, public.expenses, public.driver_days, public.counter_days from anon;

alter table public.drivers      enable row level security;
alter table public.expenses     enable row level security;
alter table public.driver_days  enable row level security;
alter table public.counter_days enable row level security;

create policy "drivers: aktif kullanıcı okur" on public.drivers
  for select to authenticated using ((select private.is_active_user()));
create policy "drivers: yönetici ekler" on public.drivers
  for insert to authenticated with check ((select private.is_admin()));
create policy "drivers: yönetici günceller" on public.drivers
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "expenses: aktif kullanıcı okur" on public.expenses
  for select to authenticated using ((select private.is_active_user()));
create policy "expenses: aktif kullanıcı ekler" on public.expenses
  for insert to authenticated with check ((select private.is_active_user()));
create policy "expenses: aktif kullanıcı günceller" on public.expenses
  for update to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()));
create policy "expenses: aktif kullanıcı siler" on public.expenses
  for delete to authenticated using ((select private.is_active_user()));

create policy "driver_days: aktif kullanıcı okur" on public.driver_days
  for select to authenticated using ((select private.is_active_user()));
create policy "driver_days: aktif kullanıcı ekler" on public.driver_days
  for insert to authenticated with check ((select private.is_active_user()));
create policy "driver_days: aktif kullanıcı günceller" on public.driver_days
  for update to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()));

create policy "counter_days: aktif kullanıcı okur" on public.counter_days
  for select to authenticated using ((select private.is_active_user()));
create policy "counter_days: aktif kullanıcı ekler" on public.counter_days
  for insert to authenticated with check ((select private.is_active_user()));
create policy "counter_days: aktif kullanıcı günceller" on public.counter_days
  for update to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()));

-- Dağıtıcı silinmez (pasife alınır); gün kayıtları silinmez (boşaltılır).
revoke delete, truncate on public.drivers, public.driver_days, public.counter_days from authenticated;

grant execute on function private.owner_driver_id() to authenticated, service_role;
revoke all on function public.get_week_board(date) from public, anon;
grant execute on function public.get_week_board(date) to authenticated;

-- -----------------------------------------------------------------------------
-- Günlük yedeğe yeni tablolar
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
      'surum', 2,
      'customers',       (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customers t),
      'customer_prices', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customer_prices t),
      'orders',          (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.orders t),
      'drivers',         (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.drivers t),
      'expenses',        (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.expenses t),
      'driver_days',     (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.driver_days t),
      'counter_days',    (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.counter_days t),
      'profiles',        (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.profiles t),
      'app_settings',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.app_settings t)
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
