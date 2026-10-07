-- =============================================================================
-- Uygulamanın kullandığı görünüm ve fonksiyonlar.
-- Hepsi security invoker: RLS politikaları aynen uygulanır.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Müşteri listesi: güncel fiyat + güncel bakiye
-- -----------------------------------------------------------------------------

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
  p.price                         as current_price,
  p.valid_from                    as price_since,
  coalesce(b.balance, 0)::numeric(14, 2) as balance,
  b.last_entry_date
from public.customers c
left join lateral (
  select cp.price, cp.valid_from
  from public.customer_prices cp
  where cp.customer_id = c.id and cp.valid_from <= private.today_tr()
  order by cp.valid_from desc
  limit 1
) p on true
left join lateral (
  select sum(o.balance_delta) as balance, max(o.entry_date) as last_entry_date
  from public.orders o
  where o.customer_id = c.id
) b on true;

-- -----------------------------------------------------------------------------
-- Müşteri oluşturma (kart + ilk fiyat tek işlemde)
-- -----------------------------------------------------------------------------

create or replace function public.create_customer(
  p_type smallint,
  p_name text,
  p_price numeric,
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
begin
  insert into public.customers (type, name, address, note)
  values (p_type, p_name, p_address, p_note)
  returning id into v_id;

  -- İlk fiyat bu haftanın başından geçerli: hafta içi önceki günler de girilebilir.
  insert into public.customer_prices (customer_id, price, valid_from)
  values (v_id, p_price, private.week_start(private.today_tr()));

  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Fiyat değiştirme (aynı gün tekrar girilirse günceller)
-- -----------------------------------------------------------------------------

create or replace function public.set_customer_price(
  p_customer_id bigint,
  p_price numeric,
  p_valid_from date default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.customer_prices (customer_id, price, valid_from)
  values (p_customer_id, p_price, coalesce(p_valid_from, private.today_tr()))
  on conflict (customer_id, valid_from) do update set price = excluded.price;
$$;

-- -----------------------------------------------------------------------------
-- Haftalık tablo: verilen tarihin haftasındaki tüm satırlar
-- -----------------------------------------------------------------------------

create or replace function public.get_week_board(p_date date)
returns table (
  id            bigint,
  customer_id   bigint,
  customer_name text,
  customer_type smallint,
  entry_date    date,
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
  select o.id, o.customer_id, c.name, c.type, o.entry_date,
         o.delivered_qty, o.returned_qty, o.unit_price,
         o.gross_amount, o.return_amount, o.net_amount, o.collection, o.balance_delta,
         o.note, private.is_locked(o.entry_date)
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.entry_date between private.week_start(p_date) and private.week_start(p_date) + 6
  order by o.entry_date, c.name_key;
$$;

-- -----------------------------------------------------------------------------
-- Dönem özeti (müşteri bazında): devreden, dönem hareketleri, kapanış bakiyesi.
-- Haftalık bakiye tablosu = bu fonksiyon + hafta aralığı.
-- -----------------------------------------------------------------------------

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
    select o.customer_id, sum(o.balance_delta) as amount
    from public.orders o
    where o.entry_date < p_from
    group by o.customer_id
  ),
  period as (
    select o.customer_id,
           sum(o.delivered_qty) as delivered_qty,
           sum(o.returned_qty)  as returned_qty,
           sum(o.gross_amount)  as gross_amount,
           sum(o.return_amount) as return_amount,
           sum(o.net_amount)    as net_amount,
           sum(o.collection)    as collection,
           sum(o.balance_delta) as delta,
           count(*)             as entry_days
    from public.orders o
    where o.entry_date between p_from and p_to
    group by o.customer_id
  )
  select c.id, c.name, c.type,
         coalesce(op.amount, 0),
         coalesce(pe.delivered_qty, 0), coalesce(pe.returned_qty, 0),
         coalesce(pe.gross_amount, 0), coalesce(pe.return_amount, 0),
         coalesce(pe.net_amount, 0), coalesce(pe.collection, 0),
         coalesce(pe.delta, 0),
         coalesce(op.amount, 0) + coalesce(pe.delta, 0),
         coalesce(pe.entry_days, 0)
  from public.customers c
  left join opening op on op.customer_id = c.id
  left join period pe on pe.customer_id = c.id
  where pe.customer_id is not null or coalesce(op.amount, 0) <> 0
  order by c.name_key;
$$;

-- -----------------------------------------------------------------------------
-- Müşteri ekstresi: gün / hafta / ay / yıl gruplu, yürüyen bakiyeli
-- -----------------------------------------------------------------------------

create or replace function public.get_customer_statement(
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

  select coalesce(sum(o.balance_delta), 0) into v_opening
  from public.orders o
  where o.customer_id = p_customer_id and o.entry_date < p_from;

  return query
  select g.period_start, g.delivered_qty, g.returned_qty, g.gross_amount, g.return_amount,
         g.net_amount, g.collection, g.delta,
         v_opening + sum(g.delta) over (order by g.period_start rows unbounded preceding)
  from (
    select date_trunc(p_group, o.entry_date::timestamp)::date as period_start,
           sum(o.delivered_qty)::bigint as delivered_qty,
           sum(o.returned_qty)::bigint  as returned_qty,
           sum(o.gross_amount)  as gross_amount,
           sum(o.return_amount) as return_amount,
           sum(o.net_amount)    as net_amount,
           sum(o.collection)    as collection,
           sum(o.balance_delta) as delta
    from public.orders o
    where o.customer_id = p_customer_id and o.entry_date between p_from and p_to
    group by 1
  ) g
  order by g.period_start;
end
$$;

-- -----------------------------------------------------------------------------
-- Genel toplamlar (panel için): gün / hafta / ay / yıl gruplu
-- -----------------------------------------------------------------------------

create or replace function public.get_totals(p_from date, p_to date, p_group text default 'day')
returns table (
  period_start   date,
  delivered_qty  bigint,
  returned_qty   bigint,
  gross_amount   numeric,
  return_amount  numeric,
  net_amount     numeric,
  collection     numeric,
  period_delta   numeric,
  customer_count bigint
)
language plpgsql stable
security invoker
set search_path = ''
as $$
begin
  if p_group not in ('day', 'week', 'month', 'year') then
    raise exception 'Geçersiz gruplama: %', p_group using errcode = '22023';
  end if;

  return query
  select date_trunc(p_group, o.entry_date::timestamp)::date,
         sum(o.delivered_qty)::bigint, sum(o.returned_qty)::bigint,
         sum(o.gross_amount), sum(o.return_amount), sum(o.net_amount),
         sum(o.collection), sum(o.balance_delta),
         count(distinct o.customer_id)
  from public.orders o
  where o.entry_date between p_from and p_to
  group by 1
  order by 1;
end
$$;

-- -----------------------------------------------------------------------------
-- Yetkiler: API fonksiyonları sadece giriş yapmış kullanıcılara.
-- -----------------------------------------------------------------------------

revoke all on function
  public.create_customer(smallint, text, numeric, text, text),
  public.set_customer_price(bigint, numeric, date),
  public.get_week_board(date),
  public.get_customer_period_summary(date, date),
  public.get_customer_statement(bigint, date, date, text),
  public.get_totals(date, date, text)
from public, anon;

grant execute on function
  public.create_customer(smallint, text, numeric, text, text),
  public.set_customer_price(bigint, numeric, date),
  public.get_week_board(date),
  public.get_customer_period_summary(date, date),
  public.get_customer_statement(bigint, date, date, text),
  public.get_totals(date, date, text)
to authenticated;

revoke all on public.customer_overview from anon;
grant select on public.customer_overview to authenticated;
