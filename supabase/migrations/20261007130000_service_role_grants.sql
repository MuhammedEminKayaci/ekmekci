-- service_role (secret key ile sunucu tarafı yönetim işlemleri) tetikleyicilerin
-- çağırdığı private yardımcı fonksiyonları çalıştırabilmeli.
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;
