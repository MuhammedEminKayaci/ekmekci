-- =============================================================================
-- Günlük otomatik yedek (Supabase içinde, pg_cron ile).
-- Her gece 03:00 (Türkiye) bütün uygulama verisinin tam kopyası yedek.gunluk
-- tablosuna yazılır; 60 günden eskiler silinir. Bilgisayarın açık olması gerekmez.
--
-- Yedek şeması API'ye açık değildir; uygulama ve dışarıdan erişilemez.
-- Listeleme:  select gun, alindi, musteri_sayisi, siparis_sayisi, bakiye from yedek.gunluk order by gun desc;
-- Elle yedek: select yedek.al();
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists yedek;
revoke all on schema yedek from public, anon, authenticated;

create table yedek.gunluk (
  id              bigint generated always as identity primary key,
  gun             date not null unique,
  alindi          timestamptz not null default now(),
  musteri_sayisi  integer not null,
  siparis_sayisi  integer not null,
  fiyat_sayisi    integer not null,
  bakiye          numeric(14, 2) not null,
  veri            jsonb not null
);

comment on table yedek.gunluk is 'Günlük tam veri kopyası: customers, customer_prices, orders, profiles, app_settings.';

revoke all on yedek.gunluk from public, anon, authenticated;

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
      'surum', 1,
      'customers',       (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customers t),
      'customer_prices', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.customer_prices t),
      'orders',          (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.orders t),
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

-- Her gece 00:00 UTC = 03:00 Türkiye. Aynı adla tekrar çalıştırılırsa günceller.
select cron.schedule('ekmekci-gunluk-yedek', '0 0 * * *', $$select yedek.al()$$);

-- İlk yedek hemen.
select yedek.al();
