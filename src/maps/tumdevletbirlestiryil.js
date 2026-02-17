// birlestir_yil.js
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =====================================================
// 📅 YIL TANIMLARI
// =====================================================
const YILLAR = [

  {
    yil: 1521,
    output: '1521.json',
    devletler: [
      'osmanli_1521.json',
      'roma_1521.json',
      'macar_1521.json',
      // Bu yıla ait tüm devlet dosyaları...
    ]
  },

  {
    yil: 1683,
    output: '1683.json',
    devletler: [
      'osmanli_1683.json',
      'avusturya_1683.json',
      'polonya_1683.json',
    ]
  },

  // Buraya istediğin kadar yıl ekle...
];
// =====================================================

for (const yilConfig of YILLAR) {
  console.log(`\n📅 ${yilConfig.yil} yılı oluşturuluyor...`);
  let allFeatures = [];

  for (const dosya of yilConfig.devletler) {
    try {
      const raw = readFileSync(join(__dirname, dosya), 'utf8');
      const geojson = JSON.parse(raw);
      allFeatures = allFeatures.concat(geojson.features);
      console.log(`   ✅ ${dosya} → ${geojson.features.length} bölge (${geojson.description || ''})`);
    } catch (e) {
      console.log(`   ⚠️  BULUNAMADI: ${dosya} - atlandı`);
    }
  }

  const merged = {
    type: "FeatureCollection",
    year: yilConfig.yil,
    features: allFeatures
  };

  writeFileSync(join(__dirname, yilConfig.output), JSON.stringify(merged, null, 2), 'utf8');
  console.log(`   💾 ${yilConfig.output} kaydedildi (${allFeatures.length} toplam bölge)`);
}

console.log('\n✅ Tüm yıllar oluşturuldu!');
