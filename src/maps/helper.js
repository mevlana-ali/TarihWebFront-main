#!/usr/bin/env node
/**
 * Historical States Config Helper
 * 
 * Bu tool ile:
 * - Mevcut GeoJSON dosyasındaki ülke/bölgeleri keşfedebilirsin
 * - Yeni devlet tanımları ekleyebilirsin
 * - Hangi bölgelerin hangi ülkelerde olduğunu görebilirsin
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ConfigHelper {
  constructor(geojsonPath) {
    const raw = readFileSync(geojsonPath, 'utf8');
    this.data = JSON.parse(raw);
    this.features = this.data.features;
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  
  /**
   * Tüm ülkeleri listele
   */
  listCountries() {
    const countries = {};
    
    for (const feature of this.features) {
      const country = feature.properties.iso_a2;
      const countryName = feature.properties.admin;
      
      if (country && countryName) {
        if (!countries[country]) {
          countries[country] = {
            name: countryName,
            count: 0,
            provinces: []
          };
        }
        countries[country].count++;
        countries[country].provinces.push(feature.properties.name);
      }
    }
    
    console.log('\n📍 Mevcut Ülkeler:\n');
    console.log('Kod  | Ülke Adı                    | Bölge Sayısı');
    console.log('-----|---------------------------|-------------');
    
    Object.entries(countries)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .forEach(([code, data]) => {
        console.log(`${code.padEnd(5)}| ${data.name.padEnd(26)}| ${data.count}`);
      });
    
    return countries;
  }
  
  /**
   * Belirli bir ülkenin bölgelerini listele
   */
  listProvinces(countryCode) {
    const provinces = this.features
      .filter(f => f.properties.iso_a2 === countryCode)
      .map(f => ({
        name: f.properties.name,
        name_local: f.properties.name_local,
        type: f.properties.type,
        region: f.properties.region
      }));
    
    if (provinces.length === 0) {
      console.log(`\n❌ "${countryCode}" kodlu ülke bulunamadı.`);
      return;
    }
    
    console.log(`\n📍 ${countryCode} - Bölgeler (${provinces.length}):\n`);
    provinces.forEach((p, i) => {
      console.log(`${(i + 1).toString().padStart(3)}. ${p.name}`);
      if (p.name_local && p.name_local !== p.name) {
        console.log(`     Yerel: ${p.name_local}`);
      }
    });
  }
  
  /**
   * İsme göre bölge ara
   */
  searchProvinces(searchTerm) {
    const term = searchTerm.toLowerCase();
    const matches = this.features.filter(f => {
      const name = f.properties.name?.toLowerCase() || '';
      const nameLocal = f.properties.name_local?.toLowerCase() || '';
      const nameAlt = f.properties.name_alt?.toLowerCase() || '';
      
      return name.includes(term) || 
             nameLocal.includes(term) || 
             nameAlt.includes(term);
    });
    
    console.log(`\n🔍 "${searchTerm}" için ${matches.length} sonuç:\n`);
    matches.slice(0, 20).forEach((m, i) => {
      console.log(`${(i + 1).toString().padStart(3)}. ${m.properties.name} (${m.properties.iso_a2}) - ${m.properties.admin}`);
    });
    
    if (matches.length > 20) {
      console.log(`\n... ve ${matches.length - 20} sonuç daha`);
    }
  }
  
  /**
   * Config template oluştur
   */
  generateTemplate(stateName, year, countryCodes) {
    const template = {
      [stateName]: {
        name: `${stateName} Adı`,
        color: "#FF0000",
        opacity: 0.65,
        stroke: "#000000",
        strokeWidth: 1.5,
        periods: {
          [year]: {
            description: `${stateName} - ${year}`,
            regions: countryCodes.map(code => ({
              type: "country",
              iso_a2: code,
              description: ""
            }))
          }
        }
      }
    };
    
    console.log('\n📋 Konfigürasyon Template:\n');
    console.log(JSON.stringify(template, null, 2));
  }
  
  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }
  
  async interactive() {
    console.log('='.repeat(60));
    console.log('🗺️  Historical Maps - Konfigürasyon Yardımcısı');
    console.log('='.repeat(60));
    
    while (true) {
      console.log('\n📋 Menü:');
      console.log('1. Tüm ülkeleri listele');
      console.log('2. Bir ülkenin bölgelerini göster');
      console.log('3. Bölge ara');
      console.log('4. Config template oluştur');
      console.log('5. Çıkış');
      
      const choice = await this.question('\nSeçiminiz (1-5): ');
      
      switch (choice.trim()) {
        case '1':
          this.listCountries();
          break;
          
        case '2':
          const code = await this.question('Ülke kodu (örn: TR, GR, BG): ');
          this.listProvinces(code.trim().toUpperCase());
          break;
          
        case '3':
          const term = await this.question('Arama terimi: ');
          this.searchProvinces(term.trim());
          break;
          
        case '4':
          const name = await this.question('Devlet adı: ');
          const year = await this.question('Yıl: ');
          const codes = await this.question('Ülke kodları (virgülle ayırarak, örn: TR,GR,BG): ');
          this.generateTemplate(
            name.trim(),
            year.trim(),
            codes.split(',').map(c => c.trim().toUpperCase())
          );
          break;
          
        case '5':
          console.log('\n👋 Görüşmek üzere!');
          this.rl.close();
          return;
          
        default:
          console.log('\n❌ Geçersiz seçim!');
      }
    }
  }
}

// MAIN
const helper = new ConfigHelper(
  join(__dirname, 'data', 'ne_10m_admin_1_states_provinces.json')
);

// Eğer parametre verilmişse, doğrudan komut çalıştır
const args = process.argv.slice(2);
if (args.length > 0) {
  const command = args[0];
  
  switch (command) {
    case 'countries':
      helper.listCountries();
      process.exit(0);
      
    case 'provinces':
      if (args[1]) {
        helper.listProvinces(args[1].toUpperCase());
      } else {
        console.log('Kullanım: node helper.js provinces <ÜLKE_KODU>');
      }
      process.exit(0);
      
    case 'search':
      if (args[1]) {
        helper.searchProvinces(args[1]);
      } else {
        console.log('Kullanım: node helper.js search <ARAMA_TERİMİ>');
      }
      process.exit(0);
      
    default:
      console.log('Kullanılabilir komutlar:');
      console.log('  node helper.js countries');
      console.log('  node helper.js provinces <ÜLKE_KODU>');
      console.log('  node helper.js search <ARAMA_TERİMİ>');
      console.log('\nVeya interaktif mod için:');
      console.log('  node helper.js');
      process.exit(0);
  }
} else {
  // İnteraktif mod
  helper.interactive().catch(console.error);
}
