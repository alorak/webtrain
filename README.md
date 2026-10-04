# WebTrain

Mobilde rahat oynanabilen izometrik bir ray kurma oyunu için ilk MVP.

## MVP 0.1

Bu sürüm ilk üç temel parçayı içerir:

1. İzometrik boş harita
2. Kamera sürükleme + pinch / mouse wheel zoom
3. Grid'e snap olan düz ray yerleştirme

Ray yönü alt araç çubuğundaki **Yön** düğmesiyle iki izometrik eksen arasında değiştirilebilir.

## Çalıştırma

```bash
npm install
npm run dev
```

Build kontrolü:

```bash
npm run build
```

## Teknoloji

- TypeScript
- Vite
- Phaser 3
- Tamamen frontend; harici asset veya backend gerektirmez

Bu sürümde zemin ve raylar Phaser Graphics ile çizilir. Bir sonraki aşamada viraj ray, ray bağlantı modeli ve tren hareketi eklenebilir.
