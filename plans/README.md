# Ekmekçi — unslop denetimi ve düzeltme planları

- Kanon: `public-2026.11.06-1` · checksum `2ff9cedd3abd8868acb8ea7c4fffa3b32cd6ed6971788ad3aca4a1a8d19ab78f` (uzak MCP, doğrulanmış yönlendirme; konular: copy, interface, process)
- Dedektör: `unslop detect.mjs` 1.0.3, `src/` · 384 ham bulgu → doğrulama sonrası aşağıdakiler
- Kanon kurallarının dedektör bağları (binding) yok: dedektör bulguları "dedektör bulgusu", geri kalanı "judgement" olarak işaretli. Bu, kanona göre temiz geçiş (pass) değildir.
- Sahibin bu turdaki açık istekleri (US-001 gereği kanon listelerinin önünde): **anlık güncelleme, hız, kayıt edilememe sorunları**. Bunlar F-planlarıdır.

## Uygulama sırası

| # | Plan | Kural | Bayrak | Durum |
|---|---|---|---|---|
| 001 | [İlk açılış animasyonlarını kaldır, süreleri kısalt](001-ilk-acilis-animasyonu.md) | KR-15, G-5, G-6, KR-16 | TOUCHES-DS | uygulandı |
| 002 | [Basma geri bildirimi 0.96](002-basma-olcegi.md) | KR-10 | TOUCHES-DS | uygulandı |
| 003 | [Gölgeler yalnız gerçek katmanlarda, tek token](003-golge-sistemi.md) | DEC-4, KR-5, E-8 | TOUCHES-DS | uygulandı |
| 004 | [Token dışı mavi](004-token-disi-renk.md) | B-2 | — | uygulandı |
| 005 | [Üretimdeki servis notu](005-servis-notu.md) | US-009, XP-33 | — | uygulandı |
| 006 | [Büyük harfli etiketler ve tire](006-buyuk-harf-tire.md) | ST-5, C-11, H-1 | — | uygulandı |
| F1 | [Her sayfa anlık güncellensin (SSE + Change Tracking)](F1-anlik-guncelleme.md) | sahip isteği | — | uygulandı |
| F2 | [Kayıt edilememe: girişler kendi değeriyle kaydedilsin](F2-kayit-guvenilirligi.md) | sahip isteği, ST-4 | — | uygulandı |
| F3 | [Hız: soğuk başlangıç ve bağlantı ısıtma](F3-hiz.md) | sahip isteği | — | uygulandı |
| 008 | [Yazı ölçeği tokenları](008-yazi-olcegi.md) | B-3 | TOUCHES-DS (sahip onayı: A yolu, 2026-11-26) | uygulandı |

## Doğrulamada elenenler

- **DS-2a (40)** `globals.css` `:root` değerleri: tokenların tanım yeri (kaynak) — bulgu değil.
- **B-1 (2)** `layout.tsx` `themeColor`: tarayıcı meta etiketi CSS değişkeni okuyamaz; değer tokenla aynı.
- **B-4 (27)** lucide'den doğrudan ikon: projede tek ikon seti (ST-1 sağlanıyor); ayrı adaptör sahibin istediği bir şey değil.
- **B-2 `text-white` / `bg-white` (24)**: koyu marka dolgusu ve yan panel üzerinde her iki temada da beyaz olması gereken metin; `--brand-ink` ile aynı değer. Ayrı bir değişiklik değeri yok.
- **H-1 `[id]/page.tsx:230`**: boş hücredeki "—" bir değer yer tutucusu, metin değil.
- `colors.ts` kategori renkleri: sahibin seçtiği tür renk paleti (bilinçli tasarım kararı).

## Temiz bulunanlar

Kopya (DEC-5, LK-01, XP-22/23): sahte kanıt, sahte aciliyet, rakip iddiası yok. ST-11 emoji ikon yok. ST-13 uydurma logo yok. KR-3 dokunma hedefleri `min-h-11`/`min-h-12` (44–48 px). J-12 açılır menülerde gösterge var.

## Doğrulama (2026-11-26, canlı)

- Dedektör tekrar: G-5 10→0, G-6 1→0, E-8 8→0, H-1 2→1 (elenen yer tutucu), B-2 26→25 (kalanlar elenen beyaz-üstü-marka metni ve grafik ucundaki beyaz halka). Kalan B-1/B-3/B-4/DS-2a doğrulamada elenenler ve 008.
- `tsc` ve `eslint` temiz; `next build` başarılı.
- Canlı (`panel.bizimfirin.com`, geçerli SSL): bütün sayfalar 200, 0,10–0,47 sn; `/web.config` 404.
- F1: veriyi değiştirmeyen bir UPDATE'ten sonra `/api/canli` olayı canlıda 74 ms'de geldi; yanıt sıkıştırılmıyor.
- F3: üretim paketinde ilk sayfa 2,6 sn → 0,36 sn (açılışta bağlantı havuzu).
- Kapsanmayan: gerçek tarayıcıda görsel karşılaştırma (ekran görüntüsü) yapılmadı; sahibin gözle kontrolü gerekir.
