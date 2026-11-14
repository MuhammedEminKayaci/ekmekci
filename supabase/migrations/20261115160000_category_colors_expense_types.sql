-- 1) Ürün türlerine renk (tabloda her tür ayrı renkte görünsün; yönetici seçer).
-- 2) Gider türleri: sabit liste yerine eklenebilir tablo.

alter table public.product_categories
  add column color text not null default 'emerald'
  check (color in ('amber', 'emerald', 'sky', 'violet', 'rose', 'orange', 'teal', 'indigo', 'lime', 'fuchsia'));

-- Mevcut türlere sırayla farklı renkler.
with ranked as (
  select id, row_number() over (order by sort_order, id) as n from public.product_categories
)
update public.product_categories c
set color = (array['amber', 'emerald', 'sky', 'violet', 'rose', 'orange', 'teal', 'indigo', 'lime', 'fuchsia'])[((r.n - 1) % 10) + 1]
from ranked r where r.id = c.id;

create table public.expense_categories (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  name_key    text generated always as (private.normalize_name(name)) stored,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint expense_categories_name_unique unique (name_key)
);

comment on table public.expense_categories is 'Gider türleri (Mazot, Yemek, Kira …). Giderdeki tür metin olarak saklanır.';

insert into public.expense_categories (name, sort_order) values
  ('Mazot', 1), ('Yemek', 2), ('Elektrik', 3), ('Kira', 4), ('Malzeme', 5), ('Tamir', 6), ('Maaş', 7), ('Diğer', 99);

-- Daha önce girilmiş ama listede olmayan türler de eklensin.
insert into public.expense_categories (name, sort_order)
select distinct on (private.normalize_name(e.category)) e.category, 50
from public.expenses e
where e.category is not null and btrim(e.category) <> ''
  and not exists (select 1 from public.expense_categories c where c.name_key = private.normalize_name(e.category));

create trigger expense_categories_90_audit
  after insert or update or delete on public.expense_categories
  for each row execute function private.audit();

revoke all on public.expense_categories from anon;
revoke truncate, references, trigger on public.expense_categories from authenticated;
alter table public.expense_categories enable row level security;

create policy "expense_categories: aktif kullanıcı okur" on public.expense_categories
  for select to authenticated using ((select private.is_active_user()));
create policy "expense_categories: aktif kullanıcı ekler" on public.expense_categories
  for insert to authenticated with check ((select private.is_active_user()));
create policy "expense_categories: yönetici günceller" on public.expense_categories
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "expense_categories: yönetici siler" on public.expense_categories
  for delete to authenticated using ((select private.is_admin()));

grant select, insert, update, delete on public.expense_categories to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.expense_categories;
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
      'surum', 6,
      'customers',         (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customers t),
      'product_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.product_categories t),
      'products',          (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.products t),
      'customer_products', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customer_products t),
      'customer_prices',   (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customer_prices t),
      'orders',            (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.orders t),
      'order_lines',       (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.order_lines t),
      'drivers',           (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.drivers t),
      'expense_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.expense_categories t),
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
