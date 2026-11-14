-- Tezgah sadeleşiyor:
-- * counter_days.sales_income = tezgahtan gelen ekmek parası (ekmek çeşidi fark etmez).
-- * counter_sales           = tezgahta satılan ek ürünler (zeytinyağı, yufka …): ad × adet × fiyat.
-- * expenses.place 'general' = günlük genel gider (Giderler sayfası). Şoför ve tezgah giderleri aynen kalır.

-- -----------------------------------------------------------------------------
-- 1) Tezgah ek ürün satışları
-- -----------------------------------------------------------------------------

create table public.counter_sales (
  id          bigint generated always as identity primary key,
  entry_date  date not null,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  qty         numeric(10, 2) not null check (qty > 0 and qty < 100000),
  unit_price  numeric(12, 2) not null check (unit_price >= 0 and unit_price < 1000000),
  amount      numeric(14, 2) generated always as (round(qty * unit_price, 2)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);

create index counter_sales_day_idx on public.counter_sales (entry_date);

comment on table public.counter_sales is 'Tezgahta satılan ek ürünler (zeytinyağı, yufka …).';

create trigger counter_sales_10_before_write
  before insert or update or delete on public.counter_sales
  for each row execute function private.day_rows_before_write();
create trigger counter_sales_20_stamp
  before insert or update on public.counter_sales
  for each row execute function private.expenses_stamp();
create trigger counter_sales_90_audit
  after insert or update or delete on public.counter_sales
  for each row execute function private.audit();

revoke all on public.counter_sales from anon;
revoke truncate, references, trigger on public.counter_sales from authenticated;
alter table public.counter_sales enable row level security;

create policy "counter_sales: aktif kullanıcı okur" on public.counter_sales
  for select to authenticated using ((select private.is_active_user()));
create policy "counter_sales: aktif kullanıcı ekler" on public.counter_sales
  for insert to authenticated with check ((select private.is_active_user()));
create policy "counter_sales: aktif kullanıcı günceller" on public.counter_sales
  for update to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()));
create policy "counter_sales: aktif kullanıcı siler" on public.counter_sales
  for delete to authenticated using ((select private.is_active_user()));

grant select, insert, update, delete on public.counter_sales to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.counter_sales;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Genel gider
-- -----------------------------------------------------------------------------

do $$
declare
  c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.expenses'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%place%'
  loop
    execute format('alter table public.expenses drop constraint %I', c);
  end loop;
end $$;

alter table public.expenses
  add constraint expenses_place_check check (place in ('driver', 'counter', 'general')),
  add constraint expenses_owner_check check (
    (place = 'driver' and driver_id is not null) or (place in ('counter', 'general') and driver_id is null)
  );

comment on table public.expenses is 'Gün içi harcamalar: şoför (mazot vb.), tezgah ya da genel.';

-- -----------------------------------------------------------------------------
-- 3) Günlük yedeğe yeni tablo
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
      'surum', 4,
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
      'counter_sales',     (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.counter_sales t),
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
