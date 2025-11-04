# Sarraf Döviz Uygulaması

Türkiye'deki birden fazla sarraf ve döviz kaynağından anlık kur verilerini toplayan, karşılaştırmalı olarak gösteren profesyonel web uygulaması.

## Özellikler

✨ **Çok Kaynaklı Veri Toplama**
- Ahlatcı Döviz
- Harem Altın (TrunCgil API)
- Hakan Döviz (TCMB - Merkez Bankası)
- Çarşı Döviz (ExchangeRate API)

📊 **Akıllı Analiz**
- **Otomatik Ortalama Hesaplama**: 4 kaynağın ortalaması
- **En Uygun Fiyat Vurgulama**: En iyi alış/satış fiyatları yeşil renkle işaretlenir
- **Gerçek Zamanlı Güncelleme**: Her 30 saniyede otomatik yenileme

🪙 **1kg Altın Karşılaştırması**
- Türkiye altın fiyatı (gram bazlı)
- Dünya altın fiyatı (XAU/USD × USD/TRY)
- Fiyat farkı ve yüzde hesaplaması
- Arbitraj fırsatlarını gösterir

💱 **Desteklenen Dövizler**
- 🇺🇸 USD (Dolar)
- 🇪🇺 EUR (Euro)
- 🇬🇧 GBP (Sterlin)
- 🇨🇭 CHF (İsviçre Frangı)
- 🪙 XAU (Gram Altın)

## Kurulum

```bash
npm install
```

## Çalıştırma

**Development Mode** (otomatik restart):
```bash
npm run dev
```

**Production Mode**:
```bash
npm start
```

Uygulama http://localhost:3000 adresinde çalışacaktır.

## API Endpoint

### GET /api/currencies

Tüm döviz verilerini, ortalamaları, en iyi fiyatları ve altın karşılaştırmasını döner.

**Response Yapısı:**
```json
{
  "success": true,
  "lastUpdate": "2025-11-01T14:38:19.263Z",
  "currencies": {
    "sources": {
      "ahlatciDoviz": { ... },
      "haremAltin": { ... },
      "hakanDoviz": { ... },
      "carsiDoviz": { ... }
    },
    "averages": {
      "USD": { "buy": "33.3552", "sell": "33.4412" },
      ...
    },
    "bestRates": {
      "USD": { "bestBuy": "haremAltin", "bestSell": "ahlatciDoviz" },
      ...
    },
    "goldComparison": {
      "turkey": { "perGram": "416.47", "per1kg": "416470.00" },
      "world": { "perGram": "1831.76", "per1kg": "1831755.82" },
      "difference": { "amount": "-1415285.82", "percent": "-77.26" }
    }
  }
}
```

## Teknik Detaylar

### Backend
- **Node.js + Express.js**
- **Axios**: HTTP istekleri
- **Cheerio**: XML/HTML parsing (TCMB verileri için)
- **node-cron**: Otomatik güncelleme (her 1 dakika)
- **Cache**: 30 saniye TTL (gereksiz API çağrılarını önler)

### Frontend
- **Vanilla JavaScript** (framework yok)
- **Modern CSS3**: Gradient'ler, animasyonlar, responsive design
- **Inter Font Family**: Profesyonel tipografi
- **Real-time Updates**: 30 saniyede bir otomatik fetch

### Özellik Detayları

**En Uygun Fiyat Algoritması:**
- **En İyi Alış (Satarken)**: En yüksek alış fiyatını veren kaynak
- **En İyi Satış (Alırken)**: En düşük satış fiyatını veren kaynak
- Yeşil vurgulama ve "En İyi" badge'i ile gösterilir

**1kg Altın Karşılaştırması:**
- **Türkiye**: Ortalama gram altın × 1000
- **Dünya**: (XAU/USD fiyatı × USD/TRY kuru × 1000) / 31.1035 (ons->gram çevrimi)
- **Fark Hesaplama**: Türkiye - Dünya (pozitif = TR daha pahalı, negatif = TR daha ucuz)

## 🌍 Dünya Altın Fiyatı Güncelleme

Uygulama dünya altın spot fiyatını (XAU/USD) otomatik çekmeye çalışır, ancak web scraping başarısız olursa fallback değer kullanılır.

### Manuel Güncelleme (Önerilen)

Güncel dünya altın fiyatını manuel olarak güncellemek için:

```bash
# Güncel fiyatı kontrol edin:
# - https://www.investing.com/commodities/gold
# - https://www.kitco.com/charts/gold
# - https://finance.yahoo.com/quote/GC=F

# Fiyatı güncelleyin (örnek: $4016/oz)
node update-gold-price.js 4016

# Server'ı yeniden başlatın
npm start
```

**Not**: Fallback değer server.js:441 ve server.js:449 satırlarında bulunur. Manuel değiştirmek isterseniz bu satırları düzenleyin.

## Güvenlik Notları

⚠️ **Production Öncesi Yapılması Gerekenler:**

1. **Rate Limiting Ekle**:
   ```bash
   npm install express-rate-limit
   ```

2. **CORS Kısıtla**:
   ```javascript
   app.use(cors({ origin: 'https://yourdomain.com' }));
   ```

3. **Environment Variables Kullan**:
   ```bash
   # .env dosyası oluştur
   PORT=3000
   AHLATCI_API_URL=https://...
   NODE_ENV=production
   ```

4. **HTTPS Kullan**: Reverse proxy (nginx) ile SSL sertifikası

5. **Monitoring Ekle**: Winston logger, Sentry error tracking

## Performans

- **Cache**: 30s TTL ile gereksiz API çağrıları önleniyor
- **Parallel Fetching**: 5 kaynak eşzamanlı çekiliyor (Promise.all)
- **Graceful Degradation**: Bir kaynak hata verse bile diğerleri çalışmaya devam eder
- **Auto-refresh**: Server-side (1dk) + Client-side (30s)

## Lisans

MIT
