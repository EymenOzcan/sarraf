/* ========================================
   PREMIUM SARRAF DÖVİZ - JAVASCRIPT
   ======================================== */

const API_URL = '/api/currencies';

// DOM Elements
const loadingState = document.getElementById('loadingState');
const mainContent = document.getElementById('mainContent');
const tableBody = document.getElementById('tableBody');
const lastUpdateElement = document.getElementById('lastUpdate');
const refreshBtn = document.getElementById('refreshBtn');
const liveClockElement = document.getElementById('liveClock');
const liveDateElement = document.getElementById('liveDate');

// Hakan Kıymetli Madenler Elements
const hakanPreciousCard = document.getElementById('hakanPreciousCard');
const hakanLondonPrice = document.getElementById('hakanLondonPrice');
const hakanIstanbulPrice = document.getElementById('hakanIstanbulPrice');
const hakanDifference = document.getElementById('hakanDifference');
const hakanFormula = document.getElementById('hakanFormula');
const hakanArrow = document.getElementById('hakanArrow');

const sourceNames = {
    ahlatciDoviz: 'Ahlatcı Döviz',
    haremAltin: 'Harem Altın',
    hakanDoviz: 'Hakan Döviz',
    carsiDoviz: 'Çarşı Döviz'
};

let updateInterval = null;
let clockInterval = null;

/* ========================================
   LIVE CLOCK
   ======================================== */

function updateLiveClock() {
    const now = new Date();

    // Time
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    liveClockElement.textContent = `${hours}:${minutes}:${seconds}`;

    // Date
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    const dateStr = now.toLocaleDateString('tr-TR', options);
    liveDateElement.textContent = dateStr;
}

function startLiveClock() {
    updateLiveClock(); // İlk güncelleme
    clockInterval = setInterval(updateLiveClock, 1000);
}

/* ========================================
   API FETCH
   ======================================== */

async function fetchCurrencies() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (data.success && data.currencies) {
            updateUI(data.currencies, data.lastUpdate);
        } else {
            showError('Veri alınamadı');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showError('Bağlantı hatası');
    }
}

/* ========================================
   UI UPDATE
   ======================================== */

function updateUI(data, lastUpdate) {
    // Son güncelleme
    updateLastUpdateTime(lastUpdate);

    // Loading'i gizle, content'i göster
    loadingState.style.display = 'none';
    mainContent.style.display = 'block';

    // Hakan Kıymetli Madenler Card'ını Güncelle
    updateHakanPreciousMetals(data.goldComparison);

    // Döviz Kurları Tablosunu Güncelle
    updateCurrencyTable(data);

    // 1KG Altın Karşılaştırmasını Güncelle
    updateGoldComparisonCard(data.goldComparison);
}

/* ========================================
   HAKAN KIYMETLİ MADENLER CARD
   ======================================== */

function updateHakanPreciousMetals(goldComparison) {
    if (!goldComparison || !goldComparison.world || !goldComparison.world.hakanComparison) {
        hakanPreciousCard.style.display = 'none';
        return;
    }

    const hakan = goldComparison.world.hakanComparison;
    hakanPreciousCard.style.display = 'block';

    // Londra Fiyatı (XAU/USD formatında göster)
    hakanLondonPrice.textContent = `$${parseFloat(hakan.london.price).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}/oz`;

    // İstanbul Fiyatı (XAU/USD formatında göster)
    hakanIstanbulPrice.textContent = `$${parseFloat(hakan.istanbul.price).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}/oz`;

    // Fark
    const diff = parseFloat(hakan.difference.total || hakan.difference.amount || 0);
    const isPositive = diff > 0;

    hakanDifference.textContent = `${isPositive ? '+' : ''}${diff.toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} ₺`;

    // Ok yönünü ayarla
    if (hakanArrow) {
        const svg = hakanArrow.querySelector('svg');
        if (isPositive) {
            svg.style.color = '#EF4444'; // Kırmızı (İstanbul pahalı)
        } else {
            svg.style.color = '#10B981'; // Yeşil (İstanbul ucuz)
        }
    }

    console.log('📊 Hakan Kıymetli Madenler güncellendi:', hakan);
}

/* ========================================
   DÖVİZ KURLARI TABLOSU
   ======================================== */

function updateCurrencyTable(data) {
    tableBody.innerHTML = '';

    const sources = ['ahlatciDoviz', 'haremAltin', 'hakanDoviz', 'carsiDoviz'];

    sources.forEach((sourceKey, index) => {
        const sourceData = data.sources[sourceKey];
        if (!sourceData) return;

        const row = document.createElement('tr');
        row.style.animationDelay = `${index * 0.1}s`;

        // Kaynak sütunu
        const sourceCell = document.createElement('td');
        sourceCell.className = 'source-cell';
        sourceCell.innerHTML = `
            <span class="source-indicator"></span>
            ${sourceNames[sourceKey]}
        `;
        row.appendChild(sourceCell);

        // Döviz sütunları
        data.currencies.forEach(currencyCode => {
            const currencyData = sourceData[currencyCode];
            const cell = document.createElement('td');

            if (currencyData && currencyData.buy && currencyData.sell) {
                const buyValue = parseFloat(currencyData.buy);
                const sellValue = parseFloat(currencyData.sell);

                if (buyValue > 0 && sellValue > 0) {
                    // En iyi fiyat kontrolü
                    const bestRates = data.bestRates?.[currencyCode];
                    const isBestBuy = bestRates?.bestBuy === sourceKey;
                    const isBestSell = bestRates?.bestSell === sourceKey;

                    cell.innerHTML = `
                        <div class="price-cell">
                            <div class="price-row ${isBestBuy ? 'best-rate' : ''}">
                                <span class="price-label">Alış</span>
                                <span class="price-value buy">${formatRate(buyValue, currencyCode)}</span>
                                ${isBestBuy ? '<span class="best-badge">En İyi</span>' : ''}
                            </div>
                            <div class="price-row ${isBestSell ? 'best-rate' : ''}">
                                <span class="price-label">Satış</span>
                                <span class="price-value sell">${formatRate(sellValue, currencyCode)}</span>
                                ${isBestSell ? '<span class="best-badge">En İyi</span>' : ''}
                            </div>
                        </div>
                    `;
                } else {
                    cell.innerHTML = '<span style="color: var(--white-40);">-</span>';
                }
            } else {
                cell.innerHTML = '<span style="color: var(--white-40);">-</span>';
            }

            row.appendChild(cell);
        });

        tableBody.appendChild(row);
    });

    // Ortalama Satırı
    if (data.averages) {
        const avgRow = document.createElement('tr');
        avgRow.className = 'average-row';
        avgRow.style.animationDelay = `${sources.length * 0.1}s`;

        const avgSourceCell = document.createElement('td');
        avgSourceCell.className = 'source-cell average-label';
        avgSourceCell.innerHTML = `
            <span class="source-indicator"></span>
            <strong>ORTALAMA</strong>
        `;
        avgRow.appendChild(avgSourceCell);

        data.currencies.forEach(currencyCode => {
            const avgData = data.averages[currencyCode];
            const cell = document.createElement('td');

            if (avgData && avgData.buy && avgData.sell) {
                const buyValue = parseFloat(avgData.buy);
                const sellValue = parseFloat(avgData.sell);

                if (buyValue > 0 && sellValue > 0) {
                    cell.innerHTML = `
                        <div class="price-cell">
                            <div class="price-row">
                                <span class="price-label">Alış</span>
                                <span class="price-value buy average-value">${formatRate(buyValue, currencyCode)}</span>
                            </div>
                            <div class="price-row">
                                <span class="price-label">Satış</span>
                                <span class="price-value sell average-value">${formatRate(sellValue, currencyCode)}</span>
                            </div>
                        </div>
                    `;
                } else {
                    cell.innerHTML = '<span style="color: var(--white-40);">-</span>';
                }
            } else {
                cell.innerHTML = '<span style="color: var(--white-40);">-</span>';
            }

            avgRow.appendChild(cell);
        });

        tableBody.appendChild(avgRow);
    }
}

/* ========================================
   1KG ALTIN KARŞILAŞTIRMASI
   ======================================== */

function updateGoldComparisonCard(goldComparison) {
    let comparisonCard = document.getElementById('goldComparisonCard');

    if (!goldComparison) {
        comparisonCard.style.display = 'none';
        return;
    }

    comparisonCard.style.display = 'block';

    const isPricier = parseFloat(goldComparison.difference.amount) > 0;
    const diffClass = isPricier ? 'negative' : 'positive';
    const diffIcon = isPricier ? '📈' : '📉';

    comparisonCard.innerHTML = `
        <div style="margin-bottom: 2rem;">
            <h2 style="display: flex; align-items: center; gap: 1rem; font-size: 2rem; font-weight: 800; color: var(--white);">
                <span style="font-size: 2rem;">⚖️</span>
                1 KG ALTIN KARŞILAŞTIRMASI
            </h2>
        </div>

        <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 2rem; align-items: center; margin-bottom: 2rem;">

            <!-- Türkiye -->
            <div style="background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(10px); border: 2px solid rgba(255, 255, 255, 0.1); border-radius: 1rem; padding: 2rem; text-align: center; position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #D4AF37, #FFD700);"></div>
                <div style="font-size: 4rem; margin-bottom: 1rem;">🇹🇷</div>
                <h4 style="color: rgba(255, 255, 255, 0.4); font-size: 0.875rem; text-transform: uppercase; margin-bottom: 0.5rem;">TÜRKİYE</h4>
                <div style="font-size: 2.5rem; font-weight: 900; color: #FFD700; margin: 1rem 0;">
                    ${parseFloat(goldComparison.turkey.per1kg).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                </div>
                <div style="color: rgba(255, 255, 255, 0.6); font-size: 1rem;">${goldComparison.turkey.perGram} ₺/gram</div>
            </div>

            <!-- VS -->
            <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #D4AF37, #B8941F); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 900; color: #0F172A; box-shadow: 0 12px 40px rgba(212, 175, 55, 0.6);">
                    VS
                </div>
            </div>

            <!-- Dünya -->
            <div style="background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(10px); border: 2px solid rgba(255, 255, 255, 0.1); border-radius: 1rem; padding: 2rem; text-align: center; position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #3B82F6, #2563EB);"></div>
                <div style="font-size: 4rem; margin-bottom: 1rem;">🌍</div>
                <h4 style="color: rgba(255, 255, 255, 0.4); font-size: 0.875rem; text-transform: uppercase; margin-bottom: 0.5rem;">DÜNYA ${diffIcon}</h4>
                <div style="font-size: 2.5rem; font-weight: 900; color: #3B82F6; margin: 1rem 0;">
                    ${parseFloat(goldComparison.world.per1kg).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                </div>
                <div style="color: rgba(255, 255, 255, 0.6); font-size: 1rem;">${goldComparison.world.perGram} ₺/gram</div>
                <div style="color: rgba(255, 255, 255, 0.4); font-size: 0.75rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                    XAU/USD: $${goldComparison.world.xauUsdPrice}/oz
                </div>
                ${goldComparison.world.lastUpdate ? `<div style="color: rgba(255, 255, 255, 0.4); font-size: 0.75rem;">Güncelleme: ${formatUpdateTime(goldComparison.world.lastUpdate)}</div>` : ''}
            </div>
        </div>

        <!-- Fark -->
        <div style="background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(10px); border: 2px solid ${isPricier ? '#EF4444' : '#10B981'}; border-radius: 1rem; padding: 2rem; text-align: center;">
            <div style="font-size: 1rem; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 0.5rem;">FARK</div>
            <div style="font-size: 3rem; font-weight: 900; color: ${isPricier ? '#EF4444' : '#10B981'}; margin: 1rem 0;">
                ${isPricier ? '+' : ''}${parseFloat(goldComparison.difference.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                <span style="font-size: 1.5rem; margin-left: 0.5rem; opacity: 0.8;">(${goldComparison.difference.percent}%)</span>
            </div>
            <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.875rem; font-weight: 600;">${goldComparison.difference.status}</div>
        </div>
    `;
}

/* ========================================
   HELPER FUNCTIONS
   ======================================== */

function formatRate(rate, currencyCode) {
    const numRate = parseFloat(rate);
    if (isNaN(numRate) || numRate === 0) return '-';

    if (currencyCode === 'XAU' || numRate > 1000) {
        return numRate.toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    return numRate.toFixed(4);
}

function updateLastUpdateTime(timestamp) {
    if (!timestamp) {
        lastUpdateElement.textContent = 'Bilinmiyor';
        return;
    }

    const date = new Date(timestamp);
    const timeText = date.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    lastUpdateElement.textContent = timeText;
}

function formatUpdateTime(timestamp) {
    if (!timestamp) return 'Bilinmiyor';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) {
        return 'Az önce';
    } else if (diff < 3600) {
        const minutes = Math.floor(diff / 60);
        return `${minutes} dk önce`;
    } else if (diff < 86400) {
        const hours = Math.floor(diff / 3600);
        return `${hours} saat önce`;
    } else {
        return date.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

function showError(message) {
    loadingState.innerHTML = `
        <div style="font-size: 4rem; margin-bottom: 1rem;">⚠️</div>
        <p style="color: #EF4444; font-weight: 700; font-size: 1.5rem;">${message}</p>
        <button onclick="location.reload()" style="
            margin-top: 2rem;
            padding: 1rem 2rem;
            background: linear-gradient(135deg, #D4AF37, #B8941F);
            border: none;
            border-radius: 12px;
            color: white;
            font-weight: 700;
            font-size: 1rem;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(212, 175, 55, 0.4);
        ">Tekrar Dene</button>
    `;
    loadingState.style.display = 'flex';
    mainContent.style.display = 'none';
}

/* ========================================
   EVENT LISTENERS
   ======================================== */

refreshBtn.addEventListener('click', async () => {
    refreshBtn.style.transform = 'rotate(360deg)';
    refreshBtn.disabled = true;

    await fetchCurrencies();

    setTimeout(() => {
        refreshBtn.style.transform = 'rotate(0deg)';
        refreshBtn.disabled = false;
    }, 500);
});

/* ========================================
   AUTO REFRESH
   ======================================== */

function startAutoRefresh() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }

    // Her 10 dakikada bir yenile
    updateInterval = setInterval(() => {
        console.log('🔄 Otomatik güncelleme yapılıyor...');
        fetchCurrencies();
    }, 600000); // 10 minutes
}

/* ========================================
   INITIALIZATION
   ======================================== */

async function init() {
    console.log('🚀 Premium Sarraf Döviz başlatılıyor...');

    // Canlı saati başlat
    startLiveClock();

    // İlk veri çekme
    await fetchCurrencies();

    // Otomatik yenileme başlat
    startAutoRefresh();

    console.log('✅ Sistem hazır!');
}

// Sayfa yüklendiğinde başlat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Sayfa kapatılırken temizlik
window.addEventListener('beforeunload', () => {
    if (updateInterval) clearInterval(updateInterval);
    if (clockInterval) clearInterval(clockInterval);
});
