-- Ürün türleri (Ekmek, Yağ, Yufka …). Türleri yönetici ekler.
-- "Ekmek türü" işaretli türlerin ürünleri tezgahta ek ürün olarak önerilmez
-- (tezgahta ekmek, çeşidi fark etmeksizin tek tutar olarak girilir).
-- Tezgah ek ürün satışları artık katalogdaki ürüne bağlanır (adı tutarsa), böylece
-- Ürünler sayfası dağıtım + tezgah satışlarını birlikte gösterir.

create table public.product_categories (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  name_key    text generated always as (private.normalize_name(name)) stored,
  is_bread    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint product_categories_name_unique unique (name_key)
);

comment on column public.product_categories.is_bread is 'Ekmek türü: ürünleri tezgahta ek ürün olarak listelenmez.';

insert into public.product_categories (name, is_bread, sort_order) values
  ('Ekmek', true, 1), ('Yağ', false, 2), ('Yufka', false, 3);

alter table public.products add column category_id bigint references public.product_categories (id) on delete restrict;

update public.products p set category_id = (
  select c.id from public.product_categories c
  where c.name_key = private.normalize_name(case
    when p.name ilike '%yağ%' or p.name ilike '%yag%' then 'Yağ'
    when p.name ilike '%yufka%' then 'Yufka'
    else 'Ekmek' end)
);

alter table public.products alter column category_id set not null;
create index products_category_idx on public.products (category_id);

-- Tezgah ek ürünü → katalogdaki ürün (ad eşleşirse kendiliğinden bağlanır).
alter table public.counter_sales add column product_id bigint references public.products (id) on delete set null;

update public.counter_sales s set product_id = p.id
from public.products p where p.name_key = private.normalize_name(s.name);

create index counter_sales_product_idx on public.counter_sales (product_id, entry_date);

create or replace function private.counter_sales_link_product()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.product_id is null or (tg_op = 'UPDATE' and new.name is distinct from old.name) then
    new.product_id := (select p.id from public.products p where p.name_key = private.normalize_name(new.name));
  end if;
  return new;
end
$$;

create trigger counter_sales_15_link_product
  before insert or update on public.counter_sales
  for each row execute function private.counter_sales_link_product();

create trigger product_categories_90_audit
  after insert or update or delete on public.product_categories
  for each row execute function private.audit();

-- Güvenlik
revoke all on public.product_categories from anon;
revoke truncate, references, trigger on public.product_categories from authenticated;
alter table public.product_categories enable row level security;

create policy "product_categories: aktif kullanıcı okur" on public.product_categories
  for select to authenticated using ((select private.is_active_user()));
create policy "product_categories: yönetici ekler" on public.product_categories
  for insert to authenticated with check ((select private.is_admin()));
create policy "product_categories: yönetici günceller" on public.product_categories
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "product_categories: yönetici siler" on public.product_categories
  for delete to authenticated using ((select private.is_admin()));

grant select, insert, update, delete on public.product_categories to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.product_categories;
  end if;
end $$;

-- Günlük yedeğe yeni tablo
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
      'surum', 5,
      'customers',         (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customers t),
      'product_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.product_categories t),
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
