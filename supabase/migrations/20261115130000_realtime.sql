-- Canlı güncelleme: uygulamanın izlediği tablolar Supabase Realtime yayınına eklenir.
-- Satır okuma yetkisi (RLS) aynen geçerlidir: yalnızca aktif kullanıcılar değişiklik bildirimi alır.
do $$
declare
  t text;
begin
  foreach t in array array['orders','order_lines','customers','customer_prices','customer_products',
                           'products','expenses','driver_days','counter_days','drivers']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
