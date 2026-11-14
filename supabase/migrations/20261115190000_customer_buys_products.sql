-- Müşteri "ürün alır mı?": almıyorsa (ör. oduncu, yalnızca cari) ürünü olmaz ve Siparişler'de listelenmez.

alter table public.customers add column buys_products boolean not null default true;

comment on column public.customers.buys_products is 'false: ürün almaz (yalnızca cari, ör. oduncu); siparişlere eklenmez.';

-- Ürün satırı olmayan ve hiç siparişi olmayan müşteriler zaten ürün almayan cari olabilir; dokunulmaz (varsayılan true).

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
  c.buys_products,
  c.created_at,
  coalesce(b.balance, 0)::numeric(14, 2) as balance,
  b.last_entry_date,
  coalesce(pr.products, '[]'::jsonb) as products
from public.customers c
left join lateral (
  select sum(m.delta) as balance, max(m.entry_date) filter (where m.source = 'order') as last_entry_date
  from private.customer_moves m
  where m.customer_id = c.id
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


grant select on public.customer_overview to authenticated;

drop function public.create_customer(smallint, text, jsonb, text, text);

create function public.create_customer(
  p_type smallint,
  p_name text,
  p_products jsonb,
  p_address text default null,
  p_note text default null,
  p_buys_products boolean default true
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
  -- Ürünsüz müşteri olabilir (ör. yalnızca kendisinden alış yaptığımız oduncu).
  if jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array' then
    raise exception 'Ürün listesi geçersiz.' using errcode = 'P0001';
  end if;

  insert into public.customers (type, name, address, note, buys_products)
  values (p_type, p_name, p_address, p_note, coalesce(p_buys_products, true))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) loop
    insert into public.customer_products (customer_id, product_id)
    values (v_id, (v_item ->> 'product_id')::bigint);
    -- İlk fiyat bu haftanın başından geçerli: hafta içi önceki günler de girilebilir.
    insert into public.customer_prices (customer_id, product_id, price, valid_from)
    values (v_id, (v_item ->> 'product_id')::bigint, (v_item ->> 'price')::numeric, private.week_start(private.today_tr()));
  end loop;

  return v_id;
end
$$;

revoke all on function public.create_customer(smallint, text, jsonb, text, text, boolean) from public, anon;
grant execute on function public.create_customer(smallint, text, jsonb, text, text, boolean) to authenticated;

-- Ürün almayan müşteri güne eklenemez.
create or replace function private.orders_customer_buys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not (select c.buys_products from public.customers c where c.id = new.customer_id) then
    raise exception 'Bu müşteri ürün almıyor (yalnızca cari); siparişe eklenemez.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger orders_05_customer_buys
  before insert on public.orders
  for each row execute function private.orders_customer_buys();
