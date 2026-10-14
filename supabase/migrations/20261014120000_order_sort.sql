-- =============================================================================
-- Gün içi müşteri sırası. Her günün sırası ayrıdır (dağıtım rotası).
-- =============================================================================

alter table public.orders
  add column sort_order integer not null default 0 check (sort_order >= 0);

comment on column public.orders.sort_order is 'Gün içindeki liste sırası (1, 2, 3…).';

-- Mevcut kayıtlar: her gün kendi içinde isim sırasıyla numaralanır.
-- Tetikleyiciler kapatılır: geçmiş hafta kilidi bu tek seferlik işlemi engellemesin,
-- değişiklik kaydı da yüzlerce satırla dolmasın.
alter table public.orders disable trigger user;

update public.orders o
   set sort_order = r.rn
  from (
    select o2.id, row_number() over (partition by o2.entry_date order by c.name_key, o2.id) as rn
    from public.orders o2
    join public.customers c on c.id = o2.customer_id
  ) r
 where r.id = o.id;

alter table public.orders enable trigger user;

-- Yeni kayıt sıra belirtilmeden gelirse günün sonuna eklenir.
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
    if new.sort_order = 0 then
      new.sort_order := coalesce(
        (select max(o.sort_order) from public.orders o where o.entry_date = new.entry_date), 0
      ) + 1;
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

-- Sadece sıra değiştiyse değişiklik kaydı tutulmaz.
create or replace function private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'updated_at' - 'updated_by' - 'sort_order')
       = (to_jsonb(new) - 'updated_at' - 'updated_by' - 'sort_order') then
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

-- Haftalık tablo artık sıra alanını döndürür ve ona göre sıralar.
drop function public.get_week_board(date);

create function public.get_week_board(p_date date)
returns table (
  id            bigint,
  customer_id   bigint,
  customer_name text,
  customer_type smallint,
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
  select o.id, o.customer_id, c.name, c.type, o.entry_date, o.sort_order,
         o.delivered_qty, o.returned_qty, o.unit_price,
         o.gross_amount, o.return_amount, o.net_amount, o.collection, o.balance_delta,
         o.note, private.is_locked(o.entry_date)
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.entry_date between private.week_start(p_date) and private.week_start(p_date) + 6
  order by o.entry_date, o.sort_order, c.name_key;
$$;

-- Bir günün sırasını tek seferde kaydeder: p_ids listedeki sıra = yeni sıra.
create function public.reorder_day(p_date date, p_ids bigint[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.orders o
     set sort_order = x.ord::int
    from unnest(p_ids) with ordinality as x(id, ord)
   where o.id = x.id
     and o.entry_date = p_date
     and o.sort_order is distinct from x.ord::int;
$$;

revoke all on function public.get_week_board(date), public.reorder_day(date, bigint[]) from public, anon;
grant execute on function public.get_week_board(date), public.reorder_day(date, bigint[]) to authenticated;
