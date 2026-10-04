# WebTrain

**Küçük bir dünya kur.** Tarayıcıda çalışan, izometrik bir tren yolu ve oyuncak dünya oluşturma oyunu. TypeScript, Phaser 3 ve Vite ile tamamen frontend; hesap, backend, harici font veya görsel servisi gerekmez.

## Oyna

- **Ray döşe:** Son ray parçasına dokun. Ray ucunda açılan yuvarlak düğmelerle sola, ileri veya sağa devam et. Düğmelerdeki oklar rayın yönüne göre döner; üzerine gelince eklenecek parçayı görürsün. Çöp kutusu son rayı kaldırır.
- **Dünyana ekle:** Sağdaki kartlardan ev, çam, çınar, gölet, dönme dolap, şelale, kamp, yel değirmeni veya balon seç; boş bir kareye dokun. Seçim yerleştirdikten sonra açık kalır.
- **Silgi:** Dekorları veya son ray parçasını kaldır. Rayların ortası silinmez; bağlantı korunur.
- **Tren:** Treni çalıştır/durdur; 0,5×, 1× veya 2× hız seç. Tren açık rotada gidip gelir; başlangıca uygun yönde bağlanan kapalı rotada döner.
- **Kamera:** Haritayı sürükle. Fare tekerleği, iki parmak veya +/− düğmeleriyle yakınlaş. Ortala düğmesi dünyayı tekrar kadraja alır.
- **Geri al/yinele:** Son 60 değişiklik oturum boyunca geri alınabilir. Yeni dünya işlemi de geri alınabilir.
- **Kayıt:** Dünya her değişiklikte bu tarayıcının `localStorage` alanına kaydedilir. Sunucuya gönderilmez. Tarayıcı verileri silinirse dünya kaybolur; kayıt engelliyse oyun o oturumda çalışmaya devam eder. Geri alma geçmişi yenilemede sıfırlanır.

Klavye: `1` ray, `2` son dekor, `E` silgi, `Space` tren, `Ctrl/⌘ Z` geri al, `Ctrl/⌘ Shift Z` yinele. Mobilde aynı araçlar sağ paneldedir.

## Geliştirme

Node.js **22.6+** (önerilen: güncel Node 22 LTS).

```bash
npm ci
npm run dev
```

```bash
npm test       # Bağlantılar, kavis geometrisi, çarpışmalar, rota ve kayıt doğrulaması
npm run build  # TypeScript + üretim derlemesi
npm run preview
```

`dist/` statik bir sunucuya veya GitHub Pages'e dağıtılabilir. Vite `base: './'` ayarı `/webtrain/` gibi alt dizinleri destekler. PR kontrolü test ve derlemeyi çalıştırır; yayınlama ayrı tutulur.

## Yapı

- `src/game/model.ts`: Phaser'dan bağımsız grid, bağlı ray rotası, çeyrek daire geometrisi ve kayıt doğrulaması.
- `src/game/art.ts`: Raylar, oyuncak dekorlar ve tren için ortak izometrik çizimler. Panel görselleri aynı çizimlerden üretilir.
- `src/scenes/WebTrainScene.ts`: Kamera, dokunma/fare, dünya düzenleme, geçmiş, kayıt ve tren hareketi.
- `src/main.ts`, `src/style.css`, `index.html`: Türkçe arayüz, erişilebilir DOM düğmeleri, kategori paneli ve küçük ekran düzeni.

## MVP sınırları

24×24 karelik tek harita ve dallanmayan tek rota vardır. Raylar ve dekorlar aynı hücreye yerleşemez; köprü, tünel, makas, çoklu tren ve dekor döndürme bu sürümde yoktur. Dönme dolap/şelale gibi dekorlar sabit çizimlerdir. Harita yerleştirmesi ve kamera için fare veya dokunmatik gerekir; panel ve ray yönleri klavyeyle kullanılabilir.
