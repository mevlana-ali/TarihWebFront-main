// birlestir_devlet.js
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =====================================================
// 🏛️ TARİHİ DEVLET TANIMLARI
// =====================================================
const DEVLETLER = [

  {
    output:      'osmanli_1521.json',
    description: 'Osmanlı İmparatorluğu - 1521',
    fillColor:   '#c8440e',
    fillOpacity:  0.65,
    strokeColor: '#3d1a00',
    strokeWidth:  1.5,
    include: [
      { file: 'turkey_provinces.json'   },
      { file: 'greece_provinces.json'   },
      { file: 'bulgaria_provinces.json' },
      { file: 'serbia_provinces.json'   },
      { file: 'bosnia_provinces.json'   },
      { file: 'romania_provinces.json', only: ['Wallachia', 'Dobruja'] },
      { file: 'egypt_provinces.json'    },
      { file: 'syria_provinces.json'    },
      { file: 'iraq_provinces.json',    only: ['Baghdad', 'Mosul']     },
    ]
  },

  {
    output:      'roma_1521.json',
    description: 'Roma İmparatorluğu - 1521 (örnek)',
    fillColor:   '#8b1a1a',
    fillOpacity:  0.65,
    strokeColor: '#2d0000',
    strokeWidth:  1.5,
    include: [
      { file: 'italy_provinces.json'    },
      { file: 'spain_provinces.json'    },
      { file: 'france_provinces.json'   },
    ]
  },

  {
    output:      'macar_1521.json',
    description: 'Macar Krallığı - 1521',
    fillColor:   '#1a5c8b',
    fillOpacity:  0.65,
    strokeColor: '#001a2d',
    strokeWidth:  1.5,
    include: [
      { file: 'hungary_provinces.json'  },
      { file: 'croatia_provinces.json'  },
      { file: 'slovakia_provinces.json' },
    ]
  },

];
// =====================================================

function loadAndFilter({ file, only, exclude, fillColor, fillOpacity, strokeColor, strokeWidth }) {
  const path = join(__dirname, file);
  try {
    const raw = readFileSync(path, 'utf8');
    const geojson = JSON.parse(raw);
    let features = geojson.features;

    if (only?.length)    features = features.filter(f => only.includes(f.properties.name));
    if (exclude?.length) features = features.filter(f => !exclude.includes(f.properties.name));
    if (fillColor || strokeColor) {
      features = features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          ...(fillColor    && { fillColor }),
          ...(fillOpacity  && { fillOpacity }),
          ...(strokeColor  && { strokeColor }),
          ...(strokeWidth  && { strokeWidth }),
        }
      }));
    }

    return features;
  } catch (e) {
    console.log(`   ⚠️  BULUNAMADI: ${file} - atlandı`);
    return [];
  }
}

for (const devlet of DEVLETLER) {
  console.log(`\n🏛️  ${devlet.description}`);
  let allFeatures = [];

  for (const source of devlet.include) {
    const features = loadAndFilter({
      ...source,
      fillColor:   source.fillColor   ?? devlet.fillColor,
      fillOpacity: source.fillOpacity ?? devlet.fillOpacity,
      strokeColor: source.strokeColor ?? devlet.strokeColor,
      strokeWidth: source.strokeWidth ?? devlet.strokeWidth,
    });
    allFeatures = allFeatures.concat(features);
    console.log(`   ✅ ${source.file} → ${features.length} bölge`);
  }

  const merged = {
    type: "FeatureCollection",
    description: devlet.description,
    features: allFeatures
  };

  writeFileSync(join(__dirname, devlet.output), JSON.stringify(merged, null, 2), 'utf8');
  console.log(`   💾 ${devlet.output} kaydedildi (${allFeatures.length} toplam bölge)`);
}

console.log('\n✅ Tüm devletler oluşturuldu!');