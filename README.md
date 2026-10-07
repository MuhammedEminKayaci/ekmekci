# Ekmekçi

Ekmek dağıtımı, iade ve tahsilat takibi. Müşteri başına fiyat, günlük kayıt, haftalık rapor ve hesap dökümü.

**Canlı adres:** https://ekmekci-five.vercel.app · **Sürüm:** 1.0 · **Geliştirici:** [www.kayacimedia.com](https://www.kayacimedia.com) · **Destek:** 0552 218 34 18

## Teknoloji

- Next.js 16 (App Router, Server Actions, Cache Components), TypeScript, Tailwind CSS 4
- Supabase (PostgreSQL, Auth, Row Level Security)
- Barındırma: Vercel

## Vercel'e yayın

Proje Vercel'de kurulu ve GitHub'a bağlı: `main` dalına yapılan her push otomatik yayınlanır.
Sıfırdan kurulum gerekirse:

1. Vercel'de **Add New → Project** ile bu GitHub deposunu içe aktarın. Framework otomatik "Next.js" seçilir.
2. **Environment Variables** bölümüne iki değişkeni girin (secret key gerekmez, uygulama kullanmaz):

   | Değişken | Değer |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://huteelmisrwjvcjsquit.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key |

3. **Deploy**'a basın.
4. Yayın adresini Supabase → Authentication → URL Configuration → **Site URL** alanına yazın.

## Kullanıcılar

- Dışarıdan kayıt olma **kapalıdır**. Kullanıcıları Supabase → Authentication → Users → **Add user** ile siz açarsınız.
- İlk açılan hesap otomatik **yönetici** olur. Sonra açılan hesaplar **pasif** başlar; aktif etmek için
  Supabase → Table Editor → `profiles` tablosunda ilgili satırın `is_active` değerini `true` yapın.

## İş kuralları

- Bakiye: **+ müşteri borçlu**, **− müşteri alacaklı** (fazla ödemiş).
- Günlük tutar = (verilen − iade) × o günkü müşteri fiyatı − alınan para.
- Fiyat değişikliği geçmiş satışları etkilemez; her satış kendi gününün fiyatını saklar (`customer_prices`).
- Geçmiş haftalar kilitlidir. Açmak için: Table Editor → `app_settings` → `lock_past_weeks = false`.
- Her değişiklik `audit_log` tablosunda kimin, neyi, ne zaman değiştirdiğiyle saklanır (yalnızca yönetici görür).

## Geliştirme

```bash
cp .env.example .env.local   # değerleri doldurun
npm install
npm run dev                  # http://localhost:3000
```

Veri tabanı değişiklikleri `supabase/migrations` altındadır; canlıya göndermek için:

```bash
supabase link --project-ref huteelmisrwjvcjsquit
supabase db push
```

`supabase/seed.sql` yalnızca yerel geliştirme içindir; canlı veri tabanına uygulanmaz.
