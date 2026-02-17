import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dosyayı oku (dosyanın aynı klasörde olduğunu varsayıyoruz)
const rawData = readFileSync(join(__dirname, 'ne_10m_admin_1_states_provinces.json'), 'utf8');
const geojson = JSON.parse(rawData);

// Sadece Türkiye illerini filtrele ve dönüştür
const turkeyFeatures = geojson.features
  .filter(feature => feature.properties.iso_a2 === 'TR')
  .map(feature => ({
    type: "Feature",
    geometry: {
      type: feature.geometry.type,
      coordinates: feature.geometry.coordinates
    },
    properties: {
      name: feature.properties.name,
      fillColor: "#e30a17",
      fillOpacity: 0.6,
      strokeColor: "#000000",
      strokeWidth: 2
    }
  }));

// FeatureCollection olarak çıktı oluştur
const output = {
  type: "FeatureCollection",
  features: turkeyFeatures
};

// Dosyaya kaydet
writeFileSync(join(__dirname, 'turkey_provinces.json'), JSON.stringify(output, null, 2), 'utf8');

console.log(`✅ Tamamlandı! ${turkeyFeatures.length} il işlendi.`);
console.log('📁 turkey_provinces.json dosyası oluşturuldu.');