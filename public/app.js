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
