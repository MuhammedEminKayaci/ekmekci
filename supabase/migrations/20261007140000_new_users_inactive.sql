-- İkinci savunma hattı: ilk kullanıcı (yönetici) dışındaki yeni hesaplar pasif açılır.
-- Kayıt olma kapalı olsa bile, yönetici aktif etmeden hiçbir veriye erişemezler.
-- Aktif etmek için: Supabase → Table Editor → profiles → is_active = true.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), ''),
    case when v_first then 'admin' else 'user' end,
    v_first
  );
  return new;
end
$$;
