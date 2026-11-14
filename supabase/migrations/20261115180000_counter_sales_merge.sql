-- Tezgah ek ürünleri: aynı gün + aynı ürün + aynı fiyat tek satır (adet toplanır).

alter table public.counter_sales
  add column name_key text generated always as (private.normalize_name(name)) stored;

-- Mevcut tekrarlı satırları birleştir (toplam değişmez). Kilit tetikleyicisi bu tek seferlik
-- düzeltme için kapatılır; geçmiş haftalardaki tutarlar aynen kalır.
alter table public.counter_sales disable trigger user;

with g as (
  select entry_date, name_key, unit_price, min(id) as keep_id, sum(qty) as total_qty
  from public.counter_sales
  group by entry_date, name_key, unit_price
  having count(*) > 1
)
update public.counter_sales s set qty = g.total_qty
from g where s.id = g.keep_id;

delete from public.counter_sales s
using (
  select entry_date, name_key, unit_price, min(id) as keep_id
  from public.counter_sales
  group by entry_date, name_key, unit_price
  having count(*) > 1
) g
where s.entry_date = g.entry_date and s.name_key = g.name_key and s.unit_price = g.unit_price and s.id <> g.keep_id;

alter table public.counter_sales enable trigger user;

alter table public.counter_sales
  add constraint counter_sales_day_item_unique unique (entry_date, name_key, unit_price);

-- Ekle: varsa adedi arttırır, yoksa yeni satır açar.
create or replace function public.add_counter_sale(p_date date, p_name text, p_qty numeric, p_price numeric)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  insert into public.counter_sales (entry_date, name, qty, unit_price)
  values (p_date, btrim(p_name), p_qty, p_price)
  on conflict (entry_date, name_key, unit_price)
  do update set qty = public.counter_sales.qty + excluded.qty
  returning id;
$$;

revoke all on function public.add_counter_sale(date, text, numeric, numeric) from public, anon;
grant execute on function public.add_counter_sale(date, text, numeric, numeric) to authenticated;
