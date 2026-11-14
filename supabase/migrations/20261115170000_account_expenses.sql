-- Cari giderler (muhasebe mantığı)
--
-- Gider bir müşteriye (cariye) bağlanabilir:
--   * kind = 'expense', payment = 'cash'    : peşin ödenen gider. Bakiye değişmez.
--   * kind = 'expense', payment = 'account' : veresiye alış. Müşteri bizden ALACAKLI olur (bakiye −tutar).
--   * kind = 'payment'                      : cariye yapılan ödeme. Alacağı kapatır (bakiye +tutar). Gider sayılmaz.
-- Müşteri bakiyesi = siparişler (satış − tahsilat) + cari hareketler. Hepsi aynı yerden hesaplanır.

alter table public.expenses
  add column customer_id bigint references public.customers (id) on delete restrict,
  add column kind text not null default 'expense' check (kind in ('expense', 'payment')),
  add column payment text not null default 'cash' check (payment in ('cash', 'account')),
  add constraint expenses_account_needs_customer check (payment = 'cash' or customer_id is not null),
  add constraint expenses_payment_needs_customer check (kind = 'expense' or (customer_id is not null and payment = 'cash'));

create index expenses_customer_idx on public.expenses (customer_id, entry_date) where customer_id is not null;

comment on column public.expenses.kind is 'expense: gider; payment: cariye ödeme (gider değil, borç kapatır).';
comment on column public.expenses.payment is 'cash: peşin; account: veresiye (müşterinin alacağına yazılır).';

-- Müşteri hesap hareketleri: tek kaynak.
create view private.customer_moves
with (security_invoker = true) as
select o.customer_id, o.entry_date, o.balance_delta as delta, 'order'::text as source
from public.orders o
union all
select e.customer_id, e.entry_date,
       case when e.kind = 'payment' then e.amount else -e.amount end,
       'account'::text
from public.expenses e
where e.customer_id is not null and (e.kind = 'payment' or e.payment = 'account');

grant select on private.customer_moves to authenticated;

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

-- Hesap dökümü: cari hareketler ayrı kolon (account_delta), fark ve bakiye ikisini birlikte içerir.
drop function public.get_customer_statement(bigint, date, date, text);

create function public.get_customer_statement(
  p_customer_id bigint,
  p_from date,
  p_to date,
  p_group text default 'day'
)
returns table (
  period_start    date,
  delivered_qty   bigint,
  returned_qty    bigint,
  gross_amount    numeric,
  return_amount   numeric,
  net_amount      numeric,
  collection      numeric,
  account_delta   numeric,
  period_delta    numeric,
  running_balance numeric
)
language plpgsql stable
security invoker
set search_path = ''
as $$
declare
  v_opening numeric;
begin
  if p_group not in ('day', 'week', 'month', 'year') then
    raise exception 'Geçersiz gruplama: %', p_group using errcode = '22023';
  end if;

  select coalesce(sum(m.delta), 0) into v_opening
  from private.customer_moves m
  where m.customer_id = p_customer_id and m.entry_date < p_from;

  return query
  select g.period_start,
         sum(g.delivered_qty)::bigint, sum(g.returned_qty)::bigint,
         sum(g.gross_amount), sum(g.return_amount), sum(g.net_amount), sum(g.collection),
         sum(g.account), sum(g.delta),
         v_opening + sum(sum(g.delta)) over (order by g.period_start rows unbounded preceding)
  from (
    select date_trunc(p_group, o.entry_date::timestamp)::date as period_start,
           o.delivered_qty::bigint as delivered_qty, o.returned_qty::bigint as returned_qty,
           o.gross_amount, o.return_amount, o.net_amount, o.collection,
           0::numeric as account, o.balance_delta as delta
    from public.orders o
    where o.customer_id = p_customer_id and o.entry_date between p_from and p_to
    union all
    select date_trunc(p_group, m.entry_date::timestamp)::date,
           0, 0, 0, 0, 0, 0, m.delta, m.delta
    from private.customer_moves m
    where m.customer_id = p_customer_id and m.source = 'account' and m.entry_date between p_from and p_to
  ) g
  group by g.period_start
  order by g.period_start;
end
$$;

revoke all on function public.get_customer_statement(bigint, date, date, text) from public, anon;
grant execute on function public.get_customer_statement(bigint, date, date, text) to authenticated;

-- Haftalık rapor: devreden / hafta / kalan cari hareketleri de içerir.
create or replace function public.get_customer_period_summary(p_from date, p_to date)
returns table (
  customer_id     bigint,
  customer_name   text,
  customer_type   smallint,
  opening_balance numeric,
  delivered_qty   bigint,
  returned_qty    bigint,
  gross_amount    numeric,
  return_amount   numeric,
  net_amount      numeric,
  collection      numeric,
  period_delta    numeric,
  closing_balance numeric,
  entry_days      bigint
)
language sql stable
security invoker
set search_path = ''
as $$
  with opening as (
    select m.customer_id, sum(m.delta) as amount
    from private.customer_moves m
    where m.entry_date < p_from
    group by m.customer_id
  ),
  period as (
    select o.customer_id,
           sum(o.delivered_qty) as delivered_qty,
           sum(o.returned_qty)  as returned_qty,
           sum(o.gross_amount)  as gross_amount,
           sum(o.return_amount) as return_amount,
           sum(o.net_amount)    as net_amount,
           sum(o.collection)    as collection,
           count(*)             as entry_days
    from public.orders o
    where o.entry_date between p_from and p_to
    group by o.customer_id
  ),
  moved as (
    select m.customer_id, sum(m.delta) as delta
    from private.customer_moves m
    where m.entry_date between p_from and p_to
    group by m.customer_id
  )
  select c.id, c.name, c.type,
         coalesce(op.amount, 0),
         coalesce(pe.delivered_qty, 0), coalesce(pe.returned_qty, 0),
         coalesce(pe.gross_amount, 0), coalesce(pe.return_amount, 0),
         coalesce(pe.net_amount, 0), coalesce(pe.collection, 0),
         coalesce(mv.delta, 0),
         coalesce(op.amount, 0) + coalesce(mv.delta, 0),
         coalesce(pe.entry_days, 0)
  from public.customers c
  left join opening op on op.customer_id = c.id
  left join period pe on pe.customer_id = c.id
  left join moved mv on mv.customer_id = c.id
  where pe.customer_id is not null or mv.customer_id is not null or coalesce(op.amount, 0) <> 0
  order by c.name_key;
$$;

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
  -- Ürünsüz müşteri olabilir (ör. yalnızca kendisinden alış yaptığımız oduncu).
  if jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array' then
    raise exception 'Ürün listesi geçersiz.' using errcode = 'P0001';
  end if;

  insert into public.customers (type, name, address, note)
  values (p_type, p_name, p_address, p_note)
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

-- Yedek: bakiye artık cari hareketleri de içerir.
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
    (select coalesce(sum(m.delta), 0) from private.customer_moves m),
    jsonb_build_object(
      'surum', 7,
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
