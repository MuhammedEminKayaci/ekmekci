-- Geliştirme verisi: Excel örneğindeki hafta (geçen hafta, 28 Eylül 2026 Pazartesi).
-- Geçmiş haftaya yazabilmek için kilit geçici olarak kapatılır.

update public.app_settings set lock_past_weeks = false;

insert into public.customers (type, name) values
  (1, 'Mehmet'), (1, 'Ahmet'), (1, 'Emrah'), (1, 'Emin'), (1, 'Onur');

insert into public.customer_prices (customer_id, price, valid_from)
select c.id, v.price, date '2026-09-01'
from (values ('Mehmet', 40), ('Ahmet', 38), ('Emrah', 35), ('Emin', 42), ('Onur', 45)) v(name, price)
join public.customers c on c.name = v.name;

insert into public.orders (customer_id, entry_date, delivered_qty, returned_qty, collection)
select c.id, v.d::date, v.delivered, v.returned, v.collection
from (values
  ('Mehmet', '2026-09-28', 83, 13, 3000),
  ('Ahmet',  '2026-09-28', 56, 12, 1500),
  ('Emrah',  '2026-09-28', 20,  0,  750),
  ('Emin',   '2026-09-28', 45,  5, 1500),
  ('Onur',   '2026-09-28', 13,  3,  500),
  ('Mehmet', '2026-09-29',  0,  0,    0),
  ('Ahmet',  '2026-09-29', 16,  0,  600),
  ('Emrah',  '2026-09-29', 15,  5,  400),
  ('Emin',   '2026-09-29', 23,  3,  840),
  ('Onur',   '2026-09-29', 82,  2, 3500),
  ('Mehmet', '2026-09-30', 18,  3,  700),
  ('Ahmet',  '2026-09-30',  0,  0,    0),
  ('Emrah',  '2026-09-30', 23,  3,  750),
  ('Emin',   '2026-09-30', 15,  5,  420),
  ('Onur',   '2026-09-30',  0,  0,    0)
) v(name, d, delivered, returned, collection)
join public.customers c on c.name = v.name;

update public.app_settings set lock_past_weeks = true;
