#!/usr/bin/env node

/**
 * Manuel Altın Fiyatı Güncelleme Aracı
 *
 * Kullanım:
 *   node update-gold-price.js 4016
 *
 * Bu script, server.js dosyasındaki fallback altın fiyatını günceller.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('❌ Hata: Altın fiyatı belirtmelisiniz!');
  console.log('');
  console.log('Kullanım:');
  console.log('  node update-gold-price.js 4016');
  console.log('');
  console.log('Güncel fiyat için:');
  console.log('  - https://www.investing.com/commodities/gold');
  console.log('  - https://www.kitco.com/charts/gold');
  console.log('  - https://finance.yahoo.com/quote/GC=F');
  process.exit(1);
}

const newPrice = parseFloat(args[0]);

if (isNaN(newPrice) || newPrice < 1000 || newPrice > 10000) {
  console.log('❌ Geçersiz fiyat! 1000-10000 arasında bir değer girin.');
  console.log(`Girilen: ${args[0]}`);
  process.exit(1);
}

const serverPath = path.join(__dirname, 'server.js');

try {
  let serverCode = fs.readFileSync(serverPath, 'utf8');

  // Fallback fiyatları bul ve güncelle (2 yer var)
  const pattern1 = /xauUsdPrice:\s*\d+,\s*\/\/ Güncel yaklaşık değer/g;
  const pattern2 = /xauUsdPrice:\s*\d+,[\s\n]*source: 'Fallback \(Error/g;

  const updated1 = serverCode.replace(pattern1, `xauUsdPrice: ${Math.round(newPrice)}, // Güncel yaklaşık değer`);
  const updated2 = updated1.replace(pattern2, `xauUsdPrice: ${Math.round(newPrice)},\n      source: 'Fallback (Error`);

  if (updated2 === serverCode) {
    console.log('⚠️  Değişiklik yapılamadı. server.js formatı değişmiş olabilir.');
    console.log('Manuel olarak server.js:441 ve server.js:449 satırlarını güncelleyin.');
    process.exit(1);
  }

  fs.writeFileSync(serverPath, updated2, 'utf8');

  console.log('✅ Altın fiyatı güncellendi!');
  console.log(`   Eski değerler → Yeni değer: $${Math.round(newPrice)}/oz`);
  console.log('');
  console.log('⚠️  Server\'ı yeniden başlatın:');
  console.log('   npm start');

} catch (error) {
  console.log('❌ Hata:', error.message);
  process.exit(1);
}
