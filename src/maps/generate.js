#!/usr/bin/env node
/**
 * Historical Maps Generator - Ana İşleme Motoru
 * 
 * Bu script tüm tarihsel harita verilerini tek seferde işler.
 * Ara dosyalar oluşturmaz, doğrudan final çıktıları üretir.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ========================================
// CORE CLASSES
// ========================================

class HistoricalMapsGenerator {
  constructor(configPath, geojsonPath) {
    console.log('🚀 Historical Maps Generator başlatılıyor...\n');
    
    this.config = this.loadJSON(configPath, 'Konfigürasyon');
    this.sourceData = this.loadJSON(geojsonPath, 'GeoJSON veri');
    
    // Performans için veriyi indexle
    this.indexedData = this.indexGeoJSON();
    
    console.log(`✅ ${this.sourceData.features.length} bölge yüklendi`);
    console.log(`✅ ${Object.keys(this.config.states).length} devlet tanımı bulundu`);
    console.log(`✅ ${Object.keys(this.config.years).length} yıl tanımı bulundu\n`);
  }
  
  loadJSON(path, description) {
    if (!existsSync(path)) {
      throw new Error(`❌ ${description} dosyası bulunamadı: ${path}`);
    }
    
    console.log(`📖 ${description} okunuyor: ${path}`);
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  }
  
  /**
   * Performans için GeoJSON verisini indexle
   * İlk filtreleme çok daha hızlı olacak
   */
  indexGeoJSON() {
    console.log('🔍 Veri indexleniyor...');
    const index = {
      byCountry: {},
      byProvince: {},
      all: this.sourceData.features
    };
    
    for (const feature of this.sourceData.features) {
      const country = feature.properties.iso_a2;
      const province = feature.properties.name;
      
      if (country) {
        if (!index.byCountry[country]) {
          index.byCountry[country] = [];
        }
        index.byCountry[country].push(feature);
      }
      
      if (province) {
        const key = province.toLowerCase();
        if (!index.byProvince[key]) {
          index.byProvince[key] = [];
        }
        index.byProvince[key].push(feature);
      }
    }
    
    console.log(`✅ ${Object.keys(index.byCountry).length} ülke indexlendi`);
    console.log(`✅ ${Object.keys(index.byProvince).length} il/bölge indexlendi\n`);
    
    return index;
  }
  
  /**
   * Bir region tanımına göre feature'ları filtrele
   */
  filterFeatures(region) {
    let features = [];
    
    switch (region.type) {
      case 'country':
        // Tüm ülke
        features = this.indexedData.byCountry[region.iso_a2] || [];
        break;
        
      case 'provinces':
        // Belirli iller
        const countryFeatures = this.indexedData.byCountry[region.iso_a2] || [];
        if (region.names && region.names.length > 0) {
          const namesLower = region.names.map(n => n.toLowerCase());
          features = countryFeatures.filter(f => 
            namesLower.some(name => 
              f.properties.name?.toLowerCase().includes(name) ||
              f.properties.name_local?.toLowerCase().includes(name) ||
              f.properties.name_alt?.toLowerCase().includes(name)
            )
          );
        }
        break;
    }
    
    return features;
  }
  
  /**
   * Bir devletin belirli bir yıldaki sınırlarını oluştur
   */
  generateStateForYear(stateName, year) {
    const stateConfig = this.config.states[stateName];
    const periodConfig = stateConfig.periods[year];
    
    if (!periodConfig) {
      return null;
    }
    
    console.log(`  📍 ${stateConfig.name} (${year})`);
    console.log(`     ${periodConfig.description}`);
    
    let allFeatures = [];
    
    // Regions işle
    for (const region of periodConfig.regions) {
      if (region.type === 'extend') {
        // Base period'dan extend et
        const baseFeatures = this.generateStateForYear(stateName, region.base);
        if (baseFeatures) {
          allFeatures = baseFeatures.features;
        }
        
        // Eklemeleri yap
        if (region.add) {
          for (const addRegion of region.add) {
            const features = this.filterFeatures(addRegion);
            allFeatures = allFeatures.concat(features);
          }
        }
        
        // Çıkarmaları yap
        if (region.remove) {
          const removeCountries = region.remove;
          allFeatures = allFeatures.filter(f => 
            !removeCountries.includes(f.properties.iso_a2)
          );
        }
      } else {
        const features = this.filterFeatures(region);
        allFeatures = allFeatures.concat(features);
      }
    }
    
    // Style uygula
    const styledFeatures = allFeatures.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        fillColor: stateConfig.color,
        fillOpacity: stateConfig.opacity,
        strokeColor: stateConfig.stroke,
        strokeWidth: stateConfig.strokeWidth,
        historicalState: stateConfig.name,
        historicalYear: year
      }
    }));
    
    console.log(`     ✅ ${styledFeatures.length} bölge`);
    
    return {
      type: "FeatureCollection",
      metadata: {
        state: stateConfig.name,
        year: parseInt(year),
        description: periodConfig.description
      },
      features: styledFeatures
    };
  }
  
  /**
   * Tüm yıllar için haritaları oluştur
   */
  generateAll(outputDir) {
    console.log('🎨 Tarihsel haritalar oluşturuluyor...\n');
    
    const results = {
      states: {},
      years: {}
    };
    
    // Her yıl için
    for (const [year, yearConfig] of Object.entries(this.config.years)) {
      console.log(`\n📅 ${year} - ${yearConfig.description}`);
      
      let yearFeatures = [];
      
      // Her devlet için
      for (const stateName of yearConfig.states) {
        const stateGeoJSON = this.generateStateForYear(stateName, year);
        
        if (stateGeoJSON) {
          // Devlet dosyasını kaydet
          const stateFilename = `${stateName}_${year}.json`;
          const statePath = join(outputDir, stateFilename);
          writeFileSync(statePath, JSON.stringify(stateGeoJSON, null, 2));
          
          if (!results.states[stateName]) {
            results.states[stateName] = {};
          }
          results.states[stateName][year] = stateFilename;
          
          // Yıl birleştirmesi için ekle
          yearFeatures = yearFeatures.concat(stateGeoJSON.features);
        }
      }
      
      // Yıl dosyasını oluştur
      const yearGeoJSON = {
        type: "FeatureCollection",
        metadata: {
          year: parseInt(year),
          description: yearConfig.description,
          states: yearConfig.states
        },
        features: yearFeatures
      };
      
      const yearFilename = `${year}.json`;
      const yearPath = join(outputDir, yearFilename);
      writeFileSync(yearPath, JSON.stringify(yearGeoJSON, null, 2));
      results.years[year] = yearFilename;
      
      console.log(`  💾 ${yearFilename} kaydedildi (${yearFeatures.length} toplam bölge)`);
    }
    
    // Özet dosya oluştur
    const summary = {
      generated: new Date().toISOString(),
      totalStates: Object.keys(this.config.states).length,
      totalYears: Object.keys(this.config.years).length,
      files: results
    };
    
    writeFileSync(
      join(outputDir, '_summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    return results;
  }
}

// ========================================
// MAIN
// ========================================

try {
  const generator = new HistoricalMapsGenerator(
    join(__dirname, 'config', 'historical-states.json'),
    join(__dirname, 'data', 'ne_10m_admin_1_states_provinces.json')
  );
  
  const results = generator.generateAll(join(__dirname, 'output'));
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ TÜM İŞLEMLER TAMAMLANDI!');
  console.log('='.repeat(60));
  console.log(`\n📊 Oluşturulan Dosyalar:`);
  console.log(`   • ${Object.keys(results.years).length} yıl dosyası`);
  console.log(`   • ${Object.values(results.states).reduce((sum, s) => sum + Object.keys(s).length, 0)} devlet dosyası`);
  console.log(`\n📁 Çıktı klasörü: ${join(__dirname, 'output')}`);
  
} catch (error) {
  console.error('\n❌ HATA:', error.message);
  console.error(error.stack);
  process.exit(1);
}
