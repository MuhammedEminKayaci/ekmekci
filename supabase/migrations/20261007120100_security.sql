-- =============================================================================
-- Erişim güvenliği: sadece giriş yapmış ve aktif kullanıcılar.
-- anon rolü hiçbir şeye erişemez. Müşteri ve fiyat kayıtları silinmez.
-- =============================================================================

create or replace function private.is_active_user()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
$$;

create or replace function private.is_admin()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = 'admin')
$$;

-- Politikalar ve görünümler private fonksiyonlarını çağırabilsin; şema API'ye açık değil.
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on function
  private.is_active_user(), private.is_admin(), private.today_tr(), private.week_start(date),
  private.normalize_name(text), private.is_locked(date), private.price_on(bigint, date)
to authenticated;

revoke all on all tables in schema public from anon;

alter table public.app_settings    enable row level security;
alter table public.profiles        enable row level security;
alter table public.customers       enable row level security;
alter table public.customer_prices enable row level security;
alter table public.orders          enable row level security;
alter table public.audit_log       enable row level security;

-- (select ...) sarmalı fonksiyonu satır başına değil sorgu başına bir kez çalıştırır.

-- app_settings
create policy "app_settings: aktif kullanıcı okur" on public.app_settings
  for select to authenticated using ((select private.is_active_user()));
create policy "app_settings: admin günceller" on public.app_settings
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- profiles
create policy "profiles: aktif kullanıcı okur" on public.profiles
  for select to authenticated using ((select private.is_active_user()) or id = (select auth.uid()));
create policy "profiles: admin günceller" on public.profiles
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- customers
create policy "customers: aktif kullanıcı okur" on public.customers
  for select to authenticated using ((select private.is_active_user()));
create policy "customers: aktif kullanıcı ekler" on public.customers
  for insert to authenticated with check ((select private.is_active_user()));
create policy "customers: aktif kullanıcı günceller" on public.customers
  for update to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()));

-- customer_prices
create policy "customer_prices: aktif kullanıcı okur" on public.customer_prices
  for select to authenticated using ((select private.is_active_user()));
create policy "customer_prices: aktif kullanıcı ekler" on public.customer_prices
  for insert to authenticated with check ((select private.is_active_user()));
create policy "customer_prices: aktif kullanıcı günceller" on public.customer_prices
  for update to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()));

-- orders
create policy "orders: aktif kullanıcı okur" on public.orders
  for select to authenticated using ((select private.is_active_user()));
create policy "orders: aktif kullanıcı ekler" on public.orders
  for insert to authenticated with check ((select private.is_active_user()));
create policy "orders: aktif kullanıcı günceller" on public.orders
  for update to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()));
create policy "orders: aktif kullanıcı siler" on public.orders
  for delete to authenticated using ((select private.is_active_user()));

-- audit_log: sadece admin okur; yazma yalnızca tetikleyiciden.
create policy "audit_log: admin okur" on public.audit_log
  for select to authenticated using ((select private.is_admin()));

-- Silme yetkisi gereken tek tablo orders; diğerlerinde DELETE kapalı.
revoke delete, truncate on public.customers, public.customer_prices, public.profiles,
  public.app_settings, public.audit_log from authenticated;
revoke insert, update on public.audit_log from authenticated;
-- created_by / created_at / unit_price gibi sistem alanlarını tetikleyiciler zorla yazar.
