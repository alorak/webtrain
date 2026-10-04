# WebTrain

**Küçük bir dünya kur.** Tarayıcıda çalışan, izometrik bir tren yolu ve oyuncak dünya oluşturma oyunu. TypeScript, Phaser 3 ve Vite ile tamamen frontend; hesap, backend, harici font veya görsel servisi gerekmez.

## Oyna

- **Ray döşe:** Rayın açık bir ucuna dokun; açılan yuvarlak düğmelerle sola, ileri veya sağa devam et. Düğmelerdeki oklar rayın yönüne göre döner; üzerine gelince eklenecek parçayı görürsün. Çöp kutusu açık uçtaki rayı kaldırır.
- **Makas:** Ortadaki düz bir raya dokun; ileri-sağ, ileri-sol, geri-sağ veya geri-sol yönünde yeni bir kol aç. Kesişim bir makas olur: varsayılan olarak düz gider. Makasa dokununca çıkan sarı düğme yönü değiştirir; kolun açık ucundan yol uzatılabilir. Aynı yöne bakan iki açık uç komşu karede buluşunca raylar birleşir.
- **Dünyana ekle:** Sağdaki kartlardan bina (ev, apartman, market, fırın, kafe, postane, kütüphane, cami, okul, hastane, itfaiye, belediye…), doğa (ağaç kümeleri, çiçekler, kayalar, gölet, şelale, dağ, hayvanlar) veya eğlence parçası seç; boş bir kareye dokun. Binalar ve dekorlar tek seferliktir. Yol, su ve çimen ise fırça gibi seçili kalır; art arda dokunarak döşenebilir. Asfalt, toprak ve taş yollar karenin içinde kalır ve türü ne olursa olsun komşu yolla tam genişlikte birleşir; malzeme değiştiği yerde ince bir derz kalır. Bir binanın kapısının önünde yol varsa, yol aynı malzemeyle kapıya kadar uzanır. Su ile açık ve koyu çimen karenin tamamını kaplar. Çimen bir altlıktır: üstüne ray, bina veya dekor konabilir. Yan yana konan hayvan ağılları (inek, koyun, tavuk, ördek, at, keçi) türü fark etmeksizin aradaki çit kalkarak tek, büyük bir ağıla dönüşür.
- **Silgi:** Dekorları veya açık uçtaki ray parçasını kaldır. Rayların ortası silinmez; ağ hep tek parça kalır.
- **Tren:** Sağ alttaki yeşil oynat/durdur düğmesini kullan. Tren makasların gösterdiği yöne gider, yolun sonunda geri döner, kapalı döngülerde turlar.
- **İstasyonlar:** Tren açık bir istasyonun ortasında durur ve bekleme süresi kadar (varsayılan 3 sn) bekleyip yoluna devam eder. Bir istasyona dokununca solda bir pencere açılır: istasyonun canlı görüntüsü, açık/kapalı ışıkları (kapalı istasyondan tren durmadan geçer) ve 1–30 sn arası bekleme süresi ayarı. Ayarlar dünya ile birlikte kaydedilir.
- **Tampon, geçit ve köprü:** Tren panelindeki *Tampon* bir rayın açık ucuna konur; tren tampona dayanınca geri döner ve o uç uzatılamaz. *Hemzemin geçit* düz bir raya konur; üzerinden toprak yol geçer, iki yandaki yollarla birleşir ve tren yaklaşınca bariyerler iner, ışıklar yanıp söner. Ray suya doğru uzatılınca (ya da rayın altına su döşenince) ahşap güverteli, korkuluklu bir köprü olur.
- **Kamera:** Haritayı sürükle. Fare tekerleği, iki parmak veya +/− düğmeleriyle yakınlaş. Ortala düğmesi dünyayı tekrar kadraja alır.
- **Geri al/yinele:** Son 60 değişiklik oturum boyunca geri alınabilir. Yeni oyun, kayıttan açma ve içe aktarma da geri alınabilir.
- **Oyun menüsü:** Sağ üstteki Trains logosu oyun penceresini açar: *Yeni oyun*, *Kaydet* (adlandırılmış kayıt; aynı ad güncellenir), *Kayıttan aç* (kayıtları tarih, ray ve dekor sayısıyla listeler; silinebilir), *Dışa aktar* (dünyayı `webtrain-<ad>.json` olarak indirir) ve *İçe aktar* (dışa aktarılmış ya da düz bir dünya JSON dosyasını yükler; bozuk dosyalar reddedilir).
- **Kayıt:** Dünya her değişiklikte bu tarayıcının `localStorage` alanına kaydedilir. Sunucuya gönderilmez. Tarayıcı verileri silinirse dünya kaybolur; kayıt engelliyse oyun o oturumda çalışmaya devam eder. Geri alma geçmişi yenilemede sıfırlanır. Adlandırılmış kayıtlar da yalnızca bu tarayıcıda, `webtrain-saves-v1` anahtarındaki kayıt dizininde tutulur; başka bir cihaza taşımak için dışa aktar.

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
- `src/game/saves.ts`: Adlandırılmış kayıtlar ve JSON dışa/içe aktarma.
- `src/game/art.ts`: Raylar, oyuncak dekorlar ve tren için ortak izometrik çizimler. Panel görselleri aynı çizimlerden üretilir.
- `src/scenes/WebTrainScene.ts`: Kamera, dokunma/fare, dünya düzenleme, geçmiş, kayıt ve tren hareketi.
- `src/main.ts`, `src/style.css`, `index.html`: Türkçe arayüz, erişilebilir DOM düğmeleri, kategori paneli ve küçük ekran düzeni.

## MVP sınırları

Harita 24×24 karelik parçalarla genişler. Bir karede en fazla bir makas olur; hemzemin geçit (dik kesişen raylar), köprü, çoklu tren ve dekor döndürme bu sürümde yoktur. Raylar ve dekorlar aynı hücreye yerleşemez (çimen altlığı, istasyon ve tünel hariç). Dönme dolap/şelale gibi dekorlar sabit çizimlerdir. Harita yerleştirmesi ve kamera için fare veya dokunmatik gerekir; panel ve ray yönleri klavyeyle kullanılabilir.
