const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

//cors
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let currencyCache = {
  lastUpdate: null,
  data: null
};

let worldGoldCache = {
  lastUpdate: null,
  data: null // { xauUsdPrice: 4002, source: 'goldapi.io' }
};

// Cache: Hakan Altın fiyatları (10 dakika)
let hakanCache = {
  lastUpdate: null,
  data: null
};

// Hakan Altın'dan XAU/USD İstanbul ve Londra fiyatlarını çek
async function fetchHakanAltin() {
  // Cache kontrolü: 10 dakika
  const CACHE_DURATION = 10 * 60 * 1000; // 10 dakika
  if (hakanCache.data && hakanCache.lastUpdate) {
    const cacheAge = Date.now() - new Date(hakanCache.lastUpdate).getTime();
    if (cacheAge < CACHE_DURATION) {
      console.log(`📦 Hakan Altın cache'ten alındı (${Math.round(cacheAge / 1000)} saniye önce)`);
      return hakanCache.data;
    }
  }

  let browser;
  try {
    console.log('🔍 Hakan Altın XAU/USD fiyatları çekiliyor...');

    const puppeteerConfig = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    };

    // Render veya production ortamı için executablePath
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(puppeteerConfig);
    const page = await browser.newPage();

    // Sadece image ve font gibi gereksiz kaynakları bloke et (JS ve CSS gerekli!)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await page.goto('https://www.hakanaltin.com/', {
      waitUntil: 'networkidle0',
      timeout: 20000
    });

    // JavaScript yüklenmesini bekle
    await page.waitForSelector('#span_ask_129', { timeout: 8000 });

    // Fiyatları çek - XAU/USD ve USD/TRY
    const prices = await page.evaluate(() => {
      // XAU/USD İstanbul ve Londra
      const istanbulAsk = document.getElementById('span_ask_129')?.textContent?.trim();
      const istanbulBid = document.getElementById('span_bid_129')?.textContent?.trim();
      const londonAsk = document.getElementById('span_ask_450')?.textContent?.trim();
      const londonBid = document.getElementById('span_bid_450')?.textContent?.trim();

      // USD/TRY kuru - tüm list-item'ları kontrol et
      let usdAsk = null;
      let usdBid = null;

      // Dolar için ID'leri dene (genellikle 113-118 arası)
      const usdIds = [113, 114, 115, 116, 117, 118];
      for (const id of usdIds) {
        const testAsk = document.getElementById(`span_ask_${id}`)?.textContent?.trim();
        const testBid = document.getElementById(`span_bid_${id}`)?.textContent?.trim();

        // Değer varsa ve makul bir dolar kuru gibi görünüyorsa (30-50 arası)
        if (testAsk && testAsk !== '-') {
          const askNum = parseFloat(testAsk.replace(/[.,]/g, ''));
          if (askNum >= 300000 && askNum <= 500000) { // 40.0000 -> 400000 gibi
            usdAsk = testAsk;
            usdBid = testBid;
            break;
          }
        }
      }

      return {
        istanbul: { bid: istanbulBid, ask: istanbulAsk },
        london: { bid: londonBid, ask: londonAsk },
        usd: { bid: usdBid, ask: usdAsk }
      };
    });

    await browser.close();

    // Değerleri parse et - hem Türk (4.136,00) hem de ABD (4,136.00) formatını destekle
    const parsePrice = (priceStr) => {
      if (!priceStr) return NaN;
      // Virgül ve nokta var mı kontrol et
      const hasComma = priceStr.includes(',');
      const hasDot = priceStr.includes('.');

      if (hasComma && hasDot) {
        // Her ikisi de var - hangisi sonra geliyorsa o ondalık ayırıcı
        const commaPos = priceStr.lastIndexOf(',');
        const dotPos = priceStr.lastIndexOf('.');

        if (commaPos > dotPos) {
          // Avrupa formatı: 4.136,00
          return parseFloat(priceStr.replace(/\./g, '').replace(',', '.'));
        } else {
          // ABD formatı: 4,136.00
          return parseFloat(priceStr.replace(/,/g, ''));
        }
      } else if (hasComma) {
        // Sadece virgül var - ondalık ayırıcı olarak kullan
        return parseFloat(priceStr.replace(',', '.'));
      } else {
        // Sadece nokta var veya hiçbiri yok
        return parseFloat(priceStr);
      }
    };

    const istanbulAsk = parsePrice(prices.istanbul.ask);
    const londonAsk = parsePrice(prices.london.ask);
    const usdAsk = parsePrice(prices.usd.ask);

    if (isFinite(istanbulAsk) && isFinite(londonAsk)) {
      const usdRate = isFinite(usdAsk) ? usdAsk : null;
      const result = {
        istanbul: istanbulAsk,
        london: londonAsk,
        usdTry: usdRate
      };

      // Cache'e kaydet
      hakanCache = {
        lastUpdate: new Date().toISOString(),
        data: result
      };

      console.log(`✅ Hakan Altın: İstanbul $${istanbulAsk}/oz, Londra $${londonAsk}/oz${usdRate ? `, USD/TRY ${usdRate}` : ''}`);
      return result;
    }

    return null;
  } catch (error) {
    console.warn('⚠️  Hakan Altın çekme hatası:', error.message);
    if (browser) await browser.close().catch(() => {});

    // Hata durumunda eski cache'i kullan
    if (hakanCache.data) {
      console.warn('⚠️  Eski Hakan Altın cache kullanılıyor');
      return hakanCache.data;
    }

    return null;
  }
}

// Ahlatcı JSON'dan gram altın (XAU-TRY) üretmeye yarayan yardımcı
async function getGoldFromAhlatciJson() {
  try {
    const resp = await axios.get('https://www.ahlatcidoviz.com.tr/static/currencies.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    if (!resp.data || !Array.isArray(resp.data)) return null;
    const rows = resp.data;
    const find = code => rows.find(r => r.SMB === code);
    const xauTry = find('XAU');
    if (xauTry && xauTry.Al && xauTry.St) {
      return {
        buy: parseFloat(xauTry.Al).toFixed(2),
        sell: parseFloat(xauTry.St).toFixed(2)
      };
    }
    // XAU-TRY yoksa XAUUSD ve USDTRY ile hesapla
    const xauUsd = find('XAUUSD');
    const usdTry = find('USD');
    if (xauUsd && usdTry && xauUsd.Al && xauUsd.St && usdTry.Al && usdTry.St) {
      const OUNCE_TO_GRAM = 31.1035;
      const buy = (parseFloat(xauUsd.Al) * parseFloat(usdTry.Al)) / OUNCE_TO_GRAM;
      const sell = (parseFloat(xauUsd.St) * parseFloat(usdTry.St)) / OUNCE_TO_GRAM;
      if (isFinite(buy) && isFinite(sell)) {
        return {
          buy: buy.toFixed(2),
          sell: sell.toFixed(2)
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// harem altın veri çekme
async function fetchHaremAltin() {
  try {

    const response = await axios.get('https://finans.truncgil.com/v4/today.json');

    if (response.data && response.data.Update_Date) {
      const data = response.data;

      // GRA = GRAMALTIN (Gram Altın)
      const goldPrice = data.GRA ? {
        buy: parseFloat(data.GRA.Buying).toFixed(2),
        sell: parseFloat(data.GRA.Selling).toFixed(2)
      } : { buy: '0', sell: '0' };

      return {
        USD: {
          buy: data.USD ? parseFloat(data.USD.Buying).toFixed(4) : '0',
          sell: data.USD ? parseFloat(data.USD.Selling).toFixed(4) : '0'
        },
        EUR: {
          buy: data.EUR ? parseFloat(data.EUR.Buying).toFixed(4) : '0',
          sell: data.EUR ? parseFloat(data.EUR.Selling).toFixed(4) : '0'
        },
        GBP: {
          buy: data.GBP ? parseFloat(data.GBP.Buying).toFixed(4) : '0',
          sell: data.GBP ? parseFloat(data.GBP.Selling).toFixed(4) : '0'
        },
        CHF: {
          buy: data.CHF ? parseFloat(data.CHF.Buying).toFixed(4) : '0',
          sell: data.CHF ? parseFloat(data.CHF.Selling).toFixed(4) : '0'
        },
        XAU: goldPrice
      };
    }

    return null;
  } catch (error) {
    console.error('Harem Altın hatası:', error.message);
    return null;
  }
}

// Hakan doviz veri çekme
async function fetchHakanDoviz() {
  try {
    const response = await axios.get('https://www.tcmb.gov.tr/kurlar/today.xml');
    const $ = cheerio.load(response.data, { xmlMode: true });

    const data = {
      USD: { buy: '0', sell: '0' },
      EUR: { buy: '0', sell: '0' },
      GBP: { buy: '0', sell: '0' },
      CHF: { buy: '0', sell: '0' },
      XAU: { buy: '0', sell: '0' }
    };

    $('Currency').each((i, elem) => {
      const code = $(elem).attr('CurrencyCode');
      if (data[code] !== undefined && code !== 'XAU') {
        const forexBuying = $(elem).find('ForexBuying').text();
        const forexSelling = $(elem).find('ForexSelling').text();
        data[code].buy = parseFloat(forexBuying).toFixed(4);
        data[code].sell = parseFloat(forexSelling).toFixed(4);
      }
    });

    // TCMB'de XAU yok, TrunCgil'den al
    try {
      const truncResp = await axios.get('https://finans.truncgil.com/v4/today.json');
      if (truncResp.data && truncResp.data.GRA) {
        data.XAU = {
          buy: parseFloat(truncResp.data.GRA.Buying).toFixed(2),
          sell: parseFloat(truncResp.data.GRA.Selling).toFixed(2)
        };
      }
    } catch (goldError) {
      console.error('Hakan Döviz altın hatası:', goldError.message);
    }

    return data;
  } catch (error) {
    console.error('Hakan Döviz hatası:', error.message);
    return null;
  }
}


async function fetchAhlatciDoviz() {
  try {
  //ahlatıcı veri çekme
    const response = await axios.get('https://www.ahlatcidoviz.com.tr/static/currencies.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (response.data && Array.isArray(response.data)) {
      const currencies = response.data;

      // Her dövizi bul
      const usd = currencies.find(c => c.SMB === 'USD');
      const eur = currencies.find(c => c.SMB === 'EUR');
      const gbp = currencies.find(c => c.SMB === 'GBP');
      const chf = currencies.find(c => c.SMB === 'CHF');

      // Ahlatcı'da XAU yok, XAU-TRY'den gram hesabı yap
      const xauTry = currencies.find(c => c.SMB === 'XAU-TRY');
      let goldPrice = { buy: '0', sell: '0' };

      if (xauTry && xauTry.Al && xauTry.St) {
        // XAU-TRY varsa direkt kullan
        goldPrice = {
          buy: parseFloat(xauTry.Al).toFixed(2),
          sell: parseFloat(xauTry.St).toFixed(2)
        };
      } else {
        // Yoksa XAUUSD × USDTRY ile hesapla
        const xauUsd = currencies.find(c => c.SMB === 'XAUUSD');
        if (xauUsd && usd && xauUsd.Al && usd.Al) {
          const OUNCE_TO_GRAM = 31.1035;
          const buy = (parseFloat(xauUsd.Al) * parseFloat(usd.Al)) / OUNCE_TO_GRAM;
          const sell = (parseFloat(xauUsd.St) * parseFloat(usd.St)) / OUNCE_TO_GRAM;
          goldPrice = {
            buy: buy.toFixed(2),
            sell: sell.toFixed(2)
          };
        }
      }

      return {
        USD: {
          buy: usd ? parseFloat(usd.Al).toFixed(4) : '0',
          sell: usd ? parseFloat(usd.St).toFixed(4) : '0'
        },
        EUR: {
          buy: eur ? parseFloat(eur.Al).toFixed(4) : '0',
          sell: eur ? parseFloat(eur.St).toFixed(4) : '0'
        },
        GBP: {
          buy: gbp ? parseFloat(gbp.Al).toFixed(4) : '0',
          sell: gbp ? parseFloat(gbp.St).toFixed(4) : '0'
        },
        CHF: {
          buy: chf ? parseFloat(chf.Al).toFixed(4) : '0',
          sell: chf ? parseFloat(chf.St).toFixed(4) : '0'
        },
        XAU: goldPrice
      };
    }

    return null;
  } catch (error) {
    console.error('Ahlatcı Döviz hatası:', error.message);
    return null;
  }
}

// Çarşı Döviz veri çekme
async function fetchCarsiDoviz() {
  try {
    // Alternatif API kullan
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    const rates = response.data.rates;
    const tryRate = rates.TRY || 34.5;

    // XAU hesaplama: Ahlatcı'dan XAU/USD çekip TRY'ye çevir
    let goldPrice = { buy: '0', sell: '0' };
    try {
      const ahlatciResp = await axios.get('https://www.ahlatcidoviz.com.tr/static/currencies.json', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      if (ahlatciResp.data && Array.isArray(ahlatciResp.data)) {
        const xauUsd = ahlatciResp.data.find(r => r.SMB === 'XAUUSD');
        if (xauUsd) {
          const OUNCE_TO_GRAM = 31.1035;
          const buy = (parseFloat(xauUsd.Al) * tryRate) / OUNCE_TO_GRAM;
          const sell = (parseFloat(xauUsd.St) * tryRate) / OUNCE_TO_GRAM;
          goldPrice = {
            buy: buy.toFixed(2),
            sell: sell.toFixed(2)
          };
        }
      }
    } catch (goldError) {
      console.error('Çarşı Döviz altın hatası:', goldError.message);
    }

    return {
      USD: {
        buy: (tryRate * 0.998).toFixed(4),
        sell: (tryRate * 1.002).toFixed(4)
      },
      EUR: {
        buy: ((tryRate / rates.EUR) * 0.998).toFixed(4),
        sell: ((tryRate / rates.EUR) * 1.002).toFixed(4)
      },
      GBP: {
        buy: ((tryRate / rates.GBP) * 0.998).toFixed(4),
        sell: ((tryRate / rates.GBP) * 1.002).toFixed(4)
      },
      CHF: {
        buy: ((tryRate / rates.CHF) * 0.998).toFixed(4),
        sell: ((tryRate / rates.CHF) * 1.002).toFixed(4)
      },
      XAU: goldPrice
    };
  } catch (error) {
    console.error('Çarşı Döviz hatası:', error.message);
    return null;
  }
}

// altın fiyatı çekme
async function fetchGoldPrices() {
  try {
    // TrunCgil'den ÖNCE gram altın çek (daha güvenilir)
    const response = await axios.get('https://finans.truncgil.com/v4/today.json');

    // GRA = GRAMALTIN (Gram Altın)
    if (response.data && response.data.GRA) {
      return {
        buy: parseFloat(response.data.GRA.Buying).toFixed(2),
        sell: parseFloat(response.data.GRA.Selling).toFixed(2)
      };
    }

    // TrunCgil çalışmazsa Ahlatcı'dan dene
    const fromAhlatci = await getGoldFromAhlatciJson();
    if (fromAhlatci) return fromAhlatci;

    return { buy: '0', sell: '0' };
  } catch (error) {
    console.error('Altın fiyatı hatası:', error.message);
    return { buy: '0', sell: '0' };
  }
}

// Ortalama hesaplama fonksiyonu
function calculateAverages(sources, currencies) {
  const averages = {};

  currencies.forEach(currency => {
    let buySum = 0, sellSum = 0, buyCount = 0, sellCount = 0;

    // XAU (Altın) için sadece güvenilir kaynakları kullan
    if (currency === 'XAU') {
      const reliableSources = ['haremAltin', 'hakanDoviz'];

      Object.entries(sources).forEach(([sourceName, source]) => {
        if (reliableSources.includes(sourceName) && source[currency]) {
          const buy = parseFloat(source[currency].buy);
          const sell = parseFloat(source[currency].sell);

          if (buy > 0) {
            buySum += buy;
            buyCount++;
          }
          if (sell > 0) {
            sellSum += sell;
            sellCount++;
          }
        }
      });
    } else {
      // Diğer dövizler için tüm kaynakları kullan
      Object.values(sources).forEach(source => {
        if (source[currency]) {
          const buy = parseFloat(source[currency].buy);
          const sell = parseFloat(source[currency].sell);

          if (buy > 0) {
            buySum += buy;
            buyCount++;
          }
          if (sell > 0) {
            sellSum += sell;
            sellCount++;
          }
        }
      });
    }

    averages[currency] = {
      buy: buyCount > 0 ? (buySum / buyCount).toFixed(currency === 'XAU' ? 2 : 4) : '0',
      sell: sellCount > 0 ? (sellSum / sellCount).toFixed(currency === 'XAU' ? 2 : 4) : '0'
    };
  });

  return averages;
}

// En uygun firma bulma fonksiyonu
function findBestRates(sources, currencies) {
  const bestRates = {};

  currencies.forEach(currency => {
    let bestBuy = { source: null, rate: -Infinity };  // En yüksek alış (satarken en iyisi)
    let bestSell = { source: null, rate: Infinity };   // En düşük satış (alırken en iyisi)

    Object.entries(sources).forEach(([sourceName, source]) => {
      if (source[currency]) {
        const buy = parseFloat(source[currency].buy);
        const sell = parseFloat(source[currency].sell);

        if (buy > 0 && buy > bestBuy.rate) {
          bestBuy = { source: sourceName, rate: buy };
        }
        if (sell > 0 && sell < bestSell.rate) {
          bestSell = { source: sourceName, rate: sell };
        }
      }
    });

    bestRates[currency] = {
      bestBuy: bestBuy.source,
      bestSell: bestSell.source
    };
  });

  return bestRates;
}

// Dünya altın fiyatı çekme (XAU/USD - Çoklu otomatik kaynak + CACHE)
async function fetchWorldGoldPrice(forceRefresh = false) {
  // Cache kontrolü: 6 saatte bir güncelle (API limiti var!)
  const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 saat

  if (!forceRefresh && worldGoldCache.data && worldGoldCache.lastUpdate) {
    const cacheAge = Date.now() - new Date(worldGoldCache.lastUpdate).getTime();
    if (cacheAge < CACHE_DURATION) {
      console.log(`📦 Dünya altın fiyatı cache'ten alındı (${Math.round(cacheAge / 60000)} dakika önce)`);
      return worldGoldCache.data;
    }
  }

  console.log('🌍 Dünya altın fiyatı (Londra) API\'den çekiliyor...');

  // KAYNAK 1: Ahlatcı XAUUSD - Londra altın fiyatı (öncelikli kaynak, limitsi)
  try {
    console.log('🔍 Ahlatcı XAUUSD (Londra) deneniyor...');
    const response = await axios.get('https://www.ahlatcidoviz.com.tr/static/currencies.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 5000
    });

    if (response.data && Array.isArray(response.data)) {
      const xauUsd = response.data.find(c => c.SMB === 'XAUUSD');
      if (xauUsd && xauUsd.Al) {
        const price = parseFloat(xauUsd.Al);
        if (price > 1000 && price < 10000) {
          const result = {
            xauUsdPrice: Math.round(price),
            source: 'Ahlatcı (Londra XAUUSD)'
          };
          worldGoldCache = {
            lastUpdate: new Date().toISOString(),
            data: result
          };
          console.log(`✅ Ahlatcı Londra: $${Math.round(price)}/oz`);
          return result;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️  Ahlatcı XAUUSD başarısız:', error.message);
  }

  // KAYNAK 2: metalpriceapi.com (yedek, 250 istek/ay)
  try {
    console.log('🔍 metalpriceapi.com deneniyor...');
    const response = await axios.get('https://api.metalpriceapi.com/v1/latest', {
      params: {
        api_key: '006c6139a87cb5757f3ef35b52aba6cb',
        base: 'XAU',
        currencies: 'USD'
      },
      timeout: 5000
    });

    if (response.data && response.data.rates && response.data.rates.USD) {
      const xauUsdRate = 1 / response.data.rates.USD;
      if (xauUsdRate > 1000 && xauUsdRate < 10000) {
        const result = {
          xauUsdPrice: Math.round(xauUsdRate),
          source: 'metalpriceapi.com'
        };
        // Cache'e kaydet
        worldGoldCache = {
          lastUpdate: new Date().toISOString(),
          data: result
        };
        console.log(`✅ metalpriceapi.com: $${Math.round(xauUsdRate)}/oz`);
        return result;
      }
    }
  } catch (error) {
    console.warn('⚠️  metalpriceapi.com başarısız:', error.message);
  }

  // KAYNAK 3: goldapi.io (yedek, günlük 100 istek)
  try {
    console.log('🔍 goldapi.io deneniyor...');
    const response = await axios.get('https://www.goldapi.io/api/XAU/USD', {
      headers: {
        'x-access-token': 'goldapi-raklgzsmhggsx1t-io'
      },
      timeout: 5000
    });

    if (response.data && response.data.price) {
      const price = parseFloat(response.data.price);
      if (price > 1000 && price < 10000) {
        const result = {
          xauUsdPrice: Math.round(price),
          source: 'goldapi.io'
        };
        worldGoldCache = {
          lastUpdate: new Date().toISOString(),
          data: result
        };
        console.log(`✅ goldapi.io: $${Math.round(price)}/oz`);
        return result;
      }
    }
  } catch (error) {
    console.warn('⚠️  goldapi.io başarısız:', error.message);
  }

  // KAYNAK 4: metals-api.com (yedek, deneme)
  try {
    console.log('🔍 metals-api.com deneniyor...');
    const response = await axios.get('https://metals-api.com/api/latest', {
      params: {
        access_key: 'demo',
        base: 'USD',
        symbols: 'XAU'
      },
      timeout: 5000
    });

    if (response.data && response.data.rates && response.data.rates.XAU) {
      const xauUsdRate = 1 / response.data.rates.XAU;
      if (xauUsdRate > 1000 && xauUsdRate < 10000) {
        const result = {
          xauUsdPrice: Math.round(xauUsdRate),
          source: 'metals-api.com'
        };
        worldGoldCache = {
          lastUpdate: new Date().toISOString(),
          data: result
        };
        console.log(`✅ metals-api.com: $${Math.round(xauUsdRate)}/oz`);
        return result;
      }
    }
  } catch (error) {
    console.warn('⚠️  metals-api.com başarısız:', error.message);
  }

  if (worldGoldCache.data) {
    console.warn('⚠️  Tüm kaynaklar başarısız, eski cache kullanılıyor');
    return worldGoldCache.data;
  }

  console.error('❌ TÜM ALTIN FİYAT KAYNAKLARI BAŞARISIZ!');
  throw new Error('Dünya altın fiyatı alınamadı - tüm kaynaklar başarısız');
}

async function calculateGoldComparison(averages) {
  try {
    const OUNCE_TO_GRAM = 31.1035;

    let trGoldPerGram = parseFloat(averages.XAU.sell);
    let trGoldSource = 'Ortalama';
    let worldGoldPerGram = 0;
    let worldGoldSource = 'Hakan Altın (Londra)';
    let usdTryRateUsed = parseFloat(averages.USD.buy);

    // Hakan Kıymetli Madenler: Londra vs İstanbul karşılaştırması
    // (Hakan Altın'dan direkt XAU/USD ve USD/TRY çekiliyor)
    let hakanComparison = null;
    try {
      console.log('🔍 Hakan Altın verisi çekiliyor...');
      const hakanData = await fetchHakanAltin();

      if (hakanData && hakanData.istanbul && hakanData.london) {
        // XAU/USD fiyatları (her ikisi de USD/ounce)
        const istanbulXAUUSD = hakanData.istanbul;  // İstanbul XAU/USD ($/oz)
        const londonXAUUSD = hakanData.london;      // Londra XAU/USD ($/oz)

        // USD/TRY kuru (Hakan Altın'dan veya TCMB'den)
        let usdTrySellRate = 42.0;
        let usdSource = 'Fallback';

        if (hakanData.usdTry && hakanData.usdTry > 30 && hakanData.usdTry < 60) {
          usdTrySellRate = hakanData.usdTry;
          usdSource = 'Hakan Altın';
          console.log(`✅ USD/TRY kuru Hakan Altın'dan alındı: ${usdTrySellRate}`);
        } else {
          // Hakan'dan kur yoksa TCMB'den çek
          try {
            const tcmbResp = await axios.get('https://www.tcmb.gov.tr/kurlar/today.xml', { timeout: 3000 });
            const match = tcmbResp.data.match(/<Currency.*?CurrencyCode="USD".*?<ForexSelling>([\d.]+)<\/ForexSelling>/s);
            if (match && match[1]) {
              usdTrySellRate = parseFloat(match[1]);
              usdSource = 'TCMB';
              console.log(`✅ USD/TRY kuru TCMB'den alındı: ${usdTrySellRate}`);
            }
          } catch (tcmbErr) {
            console.warn('⚠️  TCMB kuru çekilemedi, fallback kullanılıyor');
          }
        }

        // Formül: (İstanbul - Londra) × 31.99 × USD/TRY
        const differenceUSD = istanbulXAUUSD - londonXAUUSD;
        const step1 = differenceUSD * 31.99;
        const goldDifference = step1 * usdTrySellRate;

        console.log(`📊 Hakan Kıymetli Madenler (Londra vs İstanbul):
        - Londra XAU/USD: $${londonXAUUSD.toFixed(2)}/oz (Hakan Altın)
        - İstanbul XAU/USD: $${istanbulXAUUSD.toFixed(2)}/oz (Hakan Altın)
        - USD/TRY: ${usdTrySellRate.toFixed(4)} (${usdSource})
        - Fark: $${differenceUSD.toFixed(4)}/oz
        - × 31.99 = $${step1.toFixed(2)}
        - × ${usdTrySellRate.toFixed(4)} = ${goldDifference.toFixed(2)} TRY`);

        hakanComparison = {
          london: {
            price: londonXAUUSD.toFixed(2),
            currency: 'XAU/USD'
          },
          istanbul: {
            price: istanbulXAUUSD.toFixed(2),
            currency: 'XAU/USD'
          },
          difference: {
            amount: differenceUSD.toFixed(4),
            total: goldDifference.toFixed(2),
            unit: 'USD',
            formula: `(${istanbulXAUUSD.toFixed(2)} - ${londonXAUUSD.toFixed(2)}) × 31.99 × ${usdTrySellRate.toFixed(4)}`
          },
          usdTryRate: usdTrySellRate.toFixed(4)
        };

        // Türkiye altın fiyatı için İstanbul XAU/USD'yi TRY/gram'a çevir
        trGoldPerGram = (istanbulXAUUSD * usdTrySellRate) / OUNCE_TO_GRAM;
        trGoldSource = 'Hakan Altın (İstanbul XAU/USD)';
        // Dünya fiyatı için Londra XAU/USD'yi TRY/gram'a çevir
        worldGoldPerGram = (londonXAUUSD * usdTrySellRate) / OUNCE_TO_GRAM;
        worldGoldSource = 'Hakan Altın (Londra XAU/USD)';
        usdTryRateUsed = usdTrySellRate;
      } else {
        console.warn('⚠️  Hakan Altın verisi eksik veya geçersiz');
      }
    } catch (hakanError) {
      console.warn('⚠️  Hakan Kıymetli Madenler hesaplaması başarısız:', hakanError.message);
    }

    // Türkiye ve Dünya fiyatları ile karşılaştırma
    const trGold1kg = trGoldPerGram * 1000;
    const worldGold1kg = worldGoldPerGram * 1000;
    const difference = trGold1kg - worldGold1kg;
    const differencePercent = ((difference / worldGold1kg) * 100).toFixed(2);

    return {
      turkey: {
        perGram: trGoldPerGram.toFixed(2),
        per1kg: trGold1kg.toFixed(2),
        currency: 'TRY',
        source: trGoldSource 
      },
      world: {
        perGram: worldGoldPerGram.toFixed(2),
        per1kg: worldGold1kg.toFixed(2),
        currency: 'TRY',
        xauUsdPrice: (worldGoldPerGram * OUNCE_TO_GRAM / usdTryRateUsed).toFixed(2),
        source: worldGoldSource,
        lastUpdate: hakanCache.lastUpdate,
        usdTryRate: usdTryRateUsed.toFixed(4),
        hakanComparison: hakanComparison
      },
      difference: {
        amount: difference.toFixed(2),
        percent: differencePercent,
        status: difference > 0 ? 'Türkiye daha pahalı' : 'Türkiye daha ucuz'
      }
    };
  } catch (error) {
    console.error('Altın karşılaştırma hatası:', error.message);
    return null;
  }
}

async function fetchCurrencyData() {
  try {
    console.log('Döviz kurları çekiliyor...');

    // Her kaynak kendi altın fiyatını getiriyor artık
    const [ahlatciData, haremData, hakanData, carsiData] = await Promise.all([
      fetchAhlatciDoviz(),
      fetchHaremAltin(),
      fetchHakanDoviz(),
      fetchCarsiDoviz()
    ]);

    const sources = {
      ahlatciDoviz: ahlatciData || {},
      haremAltin: haremData || {},
      hakanDoviz: hakanData || {},
      carsiDoviz: carsiData || {}
    };

    const currencies = ['USD', 'EUR', 'GBP', 'CHF', 'XAU'];

    const averages = calculateAverages(sources, currencies);

    const bestRates = findBestRates(sources, currencies);

    const goldComparison = await calculateGoldComparison(averages);

    const data = {
      sources: sources,
      currencies: currencies,
      names: {
        USD: 'Dolar',
        EUR: 'Euro',
        GBP: 'Sterlin',
        CHF: 'Frank',
        XAU: 'Altın'
      },
      icons: {
        USD: '$',
        EUR: '€',
        GBP: '£',
        CHF: 'CHF',
        XAU: '🪙'
      },
      averages: averages,
      bestRates: bestRates,
      goldComparison: goldComparison
    };

    currencyCache = {
      lastUpdate: new Date().toISOString(),
      data: data
    };

    console.log('✅ Döviz kurları güncellendi:', new Date().toLocaleString('tr-TR'));
    return data;

  } catch (error) {
    console.error('❌ Veri çekme hatası:', error.message);

    if (currencyCache.data) {
      return currencyCache.data;
    }

    throw error;
  }
}

app.get('/api/currencies', async (req, res) => {
  try {
      const cacheAge = currencyCache.lastUpdate
      ? Date.now() - new Date(currencyCache.lastUpdate).getTime()
      : Infinity;

    if (!currencyCache.data || cacheAge > 600000) {
      await fetchCurrencyData();
    }

    res.json({
      success: true,
      lastUpdate: currencyCache.lastUpdate,
      currencies: currencyCache.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Döviz kurları alınamadı'
    });
  }
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

cron.schedule('*/10 * * * *', () => {
  console.log('🇹🇷 Türkiye döviz verileri güncelleniyor... (10dk)');
  fetchCurrencyData();
});

  
cron.schedule('0 */6 * * *', async () => {
  console.log('🌍 Dünya altın fiyatı güncelleniyor... (6 saat)');
  await fetchWorldGoldPrice(true); // forceRefresh = true
  console.log('✅ Dünya altın fiyatı cache güncellendi');
});

fetchCurrencyData().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server http://localhost:${PORT} adresinde çalışıyor`);
    console.log(`📊 API endpoint: http://localhost:${PORT}/api/currencies`);
  });
}).catch(err => {
  console.error('Başlatma hatası:', err);
 
  app.listen(PORT, () => {
    console.log(`⚠️  Server http://localhost:${PORT} adresinde çalışıyor (veri hatası)`);
  });
});
