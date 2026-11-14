-- =============================================================================
-- Güvenlik sıkılaştırması (denetim bulguları)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Gereğinden geniş tablo yetkileri
--    TRUNCATE satır kurallarını (RLS), geçmiş hafta kilidini ve değişiklik
--    kaydını atlar; uygulamada hiçbir rolün buna ihtiyacı yok.
-- -----------------------------------------------------------------------------

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert on public.profiles, public.app_settings from authenticated;
revoke insert, update, delete on public.customer_overview from authenticated;

-- Yeni tablolar da aynı kurala uysun.
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) private şemasındaki fonksiyonlar: varsayılan PUBLIC çalıştırma yetkisi kalksın,
--    yalnızca gerekenler açıkça verilsin.
-- -----------------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon;
alter default privileges in schema private revoke execute on functions from public;
grant execute on function
  private.is_active_user(), private.is_admin(), private.today_tr(), private.week_start(date),
  private.normalize_name(text), private.is_locked(date), private.price_on(bigint, date),
  private.owner_driver_id()
to authenticated;

-- Supabase'in "yeni tabloda RLS'i otomatik aç" tetikleyicisi: dışarıdan çağrılmasına gerek yok.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) Sipariş satırı başka müşteriye ya da başka güne taşınamaz.
--    Değişebilenler: verilen, iade, tahsilat, not, sıra.
-- -----------------------------------------------------------------------------

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
    if new.driver_id <> old.driver_id
       or new.customer_id <> old.customer_id
       or new.entry_date <> old.entry_date then
      raise exception 'Kaydın müşterisi, günü ve dağıtıcısı değiştirilemez; satırı silip doğru yere ekleyin.'
        using errcode = 'P0001', hint = 'immutable_keys';
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

-- Gider ve gün kayıtları da başka güne/yere taşınamaz.
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
  if tg_op = 'UPDATE' and new.entry_date <> old.entry_date then
    raise exception 'Kaydın günü değiştirilemez.' using errcode = 'P0001', hint = 'immutable_keys';
  end if;
  new.updated_at := now();
  return new;
end
$$;

revoke execute on function private.orders_before_write(), private.day_rows_before_write() from public, anon;

-- -----------------------------------------------------------------------------
-- 4) Tezgah tutarlarına üst sınır (diğer tablolarla aynı: 10 milyon ₺ altı)
-- -----------------------------------------------------------------------------

alter table public.counter_days
  add constraint counter_days_money_bounds check (
    opening_cash < 10000000 and sales_income < 10000000 and closing_cash < 10000000
    and (handed_over is null or handed_over < 10000000)
    and (bread_price is null or bread_price < 100000)
  );
