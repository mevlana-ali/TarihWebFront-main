/**
 * TarihselHarita.jsx  –  MapTiler + MapLibre GL JS + Timeline
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// 1. ADIM: Tüm harita verilerini baştan yüklüyoruz ki geçişler çok akıcı olsun.
import data1250 from './maps/1250.json';
import data1300 from './maps/1300.json';
import data1350 from './maps/1350.json';
import data1450 from './maps/1450.json';
import data1520 from './maps/1520.json';
import data1650 from './maps/1650.json';
import data1700 from './maps/1700.json';
import data17 from './maps/17.json';
import data1 from './maps/1.json';
import data1000 from './maps/1000.json'
import data50 from './maps/50.json'
import data68 from './maps/68.json'
import data80 from './maps/80.json'
import data117 from './maps/117.json'
import data130 from './maps/130.json'
import data180 from './maps/180.json'

const MAP_DATA_BY_YEAR = {
  1250: data1250,
  1300: data1300,
  1350: data1350,
  1450: data1450,
  1520: data1520,
  1650: data1650,
  1700: data1700,
  1000: data1000,
  17: data17,
  50: data50,
  1: data1,
  68: data68,
  80: data80,
  117: data117,
  130: data130,
  180: data180,
};

// Yılları sıralı bir diziye alıyoruz
const YEARS = Object.keys(MAP_DATA_BY_YEAR).map(Number).sort((a, b) => a - b);

const DEFAULT_KEY = 'LnOZEqH5LZiYHN4SpJ9b'; 

const STYLES = {
  ozel_haritam: { name: '🏰 Benim Özel Haritam', id: '019c7250-3e57-7b02-a180-182617f96e7e' },
  topo_v2:      { name: '🗺️ Topo (Tarihi Benzeri)',    id: 'topo-v2' },
  streets_v2:   { name: '🏙️ Streets',                  id: 'streets-v2' },
  basic_v2:     { name: '📋 Basic (Temiz)',             id: 'basic-v2' },
  dataviz:      { name: '📊 Dataviz (Açık)',            id: 'dataviz' },
  dataviz_dark: { name: '🌑 Dataviz Koyu',             id: 'dataviz-dark' },
  outdoor_v2:   { name: '🌿 Outdoor',                  id: 'outdoor-v2' },
  hybrid:       { name: '🛰️ Satellite + Etiket',       id: 'hybrid' },
  openstreetmap:{ name: '🗾 OpenStreetMap',            id: 'openstreetmap' },
};
// Tüm dünyayı kaplayan sanal bir çokgen
const WORLD_BOUNDS = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-180, -90],
        [180, -90],
        [180, 90],
        [-180, 90],
        [-180, -90]
      ]]
    }
  }]
};
const SOURCE_ID = 'tarihi';
const FILL_ID   = 'tarihi-fill';
const HOVER_ID  = 'tarihi-hover';
const STROKE_ID = 'tarihi-stroke';

function firstSymbol(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) {
    if (l.type === 'symbol') return l.id;
  }
  return undefined;
}

export default function TarihselHarita() {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const hoveredId    = useRef(null);
  const popupRef     = useRef(null);

  const [apiKey,       setApiKey]       = useState(DEFAULT_KEY);
  const [draftKey,     setDraftKey]     = useState(DEFAULT_KEY);
  const [showKeyPanel, setShowKeyPanel] = useState(!DEFAULT_KEY);
  const [activeStyle,  setActiveStyle]  = useState('ozel_haritam');
  const [mapReady,     setMapReady]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [selected,     setSelected]     = useState(null);

  // ZAMAN ÇİZELGESİ STATE'İ
  const [yearIndex, setYearIndex] = useState(0); 
  const currentYear = YEARS[yearIndex];

  // Seçili yıla ait veriyi MapLibre'nin anlayacağı formata (ID ekleyerek) getiriyoruz
  const currentGeoJson = useMemo(() => {
    const rawData = MAP_DATA_BY_YEAR[currentYear];
    return {
      ...rawData,
      features: rawData.features.map((f, i) => ({ ...f, id: i }))
    };
  }, [currentYear]);

  const styleUrl = useCallback(
    (styleId) => `https://api.maptiler.com/maps/${styleId}/style.json?key=${apiKey}&fresh=${Date.now()}`,
    [apiKey]
  );

const injectLayers = useCallback((map, geoData) => {
    // Katmanları temizle (Önceki tint katmanını da ekleyelim)
    ['global-tint-layer', HOVER_ID, STROKE_ID, FILL_ID].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('global-tint')) map.removeSource('global-tint');
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

    const before = firstSymbol(map);

    // 🌟 GÜNCELLENMİŞ: "ESKİTME DOKUSU" (GLOBAL TINT) KATMANI 🌟
    // Daha açık bir parşömen rengi (#e8d8bd) ve daha yüksek şeffaflık (0.6)
    // Bu, modern haritayı daha fazla soluklaştırır ve eski kağıt dokusu hissi verir.
    map.addSource('global-tint', { type: 'geojson', data: WORLD_BOUNDS });
    map.addLayer({
      id: 'global-tint-layer',
      type: 'fill',
      source: 'global-tint',
      paint: {
        'fill-color': '#e8d8bd', 
        'fill-opacity': 0.6     
      }
    }, before);


    // --- KENDİ TARİHİ VERİLERİN ---
    map.addSource(SOURCE_ID, { 
      type: 'geojson', 
      data: geoData,
      tolerance: 1.5 
    });

    // 🌟 GÜNCELLENMİŞ: "BÖLGELER" (FILL_ID) KATMANI 🌟
    // Şeffaflığı 0.45'e düşürdük.
    // Bu, alttaki "eskitme dokusunun" üstten belli olmasını sağlar ve 
    // bölgelerin modern harita üzerinde "yama" gibi durmasını engeller.
    map.addLayer({
      id: FILL_ID, type: 'fill', source: SOURCE_ID,
      paint: {
        'fill-color':   ['coalesce', ['get', 'fillColor'],   '#4a90d9'],
        'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.45], 
      },
    }, before);

    // 🌟 GÜNCELLENMİŞ: "HOVER" (HOVER_ID) KATMANI 🌟
    // Şeffaflığı 0.1'e düşürdük. Üzerine gelince hafifçe parlamasını sağlar.
    map.addLayer({
      id: HOVER_ID, type: 'fill', source: SOURCE_ID,
      paint: {
        'fill-color':   '#ffffff',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.1, 0],
      },
    }, before);

    // 🌟 GÜNCELLENMİŞ: "KENARLIK" (STROKE_ID) KATMANI 🌟
    // Kenarlık rengini daha koyu kahverengi (#5d4037) yaptık.
    // Şeffaflığı 1.0 (tamamen opak) yaptık.
    // Bu, bölgelerin bağımsızca ayrılmasını ve harita üzerinde net görünmesini sağlar.
    map.addLayer({
      id: STROKE_ID, type: 'line', source: SOURCE_ID,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'  
      },
      paint: {
        'line-color': '#5d4037', 
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          3, 0.5,  
          10, 1.2  
        ],
        'line-opacity': 1.0, 
      },
    }, before);

    map.on('mousemove', FILL_ID, (e) => {
      if (e.originalEvent.buttons !== 0 || map.isMoving()) return;
      if (!e.features.length) return;
      map.getCanvas().style.cursor = 'pointer';
      const id = e.features[0].id;
      if (hoveredId.current !== null && hoveredId.current !== id) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredId.current }, { hover: false });
      }
      hoveredId.current = id;
      map.setFeatureState({ source: SOURCE_ID, id }, { hover: true });
    });

    map.on('mouseleave', FILL_ID, () => {
      map.getCanvas().style.cursor = '';
      if (hoveredId.current !== null) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredId.current }, { hover: false });
        hoveredId.current = null;
      }
    });

    map.on('click', FILL_ID, (e) => {
      const p = e.features[0]?.properties ?? {};
      setSelected({ ...p, lngLat: e.lngLat, year: currentYear });
    });
  }, [currentYear]);
  // Harita Başlatma
  useEffect(() => {
    if (!apiKey || !containerRef.current) return;

    setError('');
    setMapReady(false);
    setLoading(true);

    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     styleUrl(STYLES[activeStyle].id),
      center:    [35, 39],
      zoom:      5.2,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      injectLayers(map, currentGeoJson);
      setMapReady(true);
      setLoading(false);
    });

    map.on('error', (e) => {
      console.error('MapLibre hata:', e);
      const msg = String(e?.error?.message ?? e?.error ?? '');
      if (/401|403/i.test(msg)) setError('❌ API Key geçersiz.');
      else if (/404/i.test(msg)) setError('❌ Harita stili bulunamadı.');
      else setError(`❌ Hata: ${msg}`);
      setLoading(false);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [apiKey]); 

  // Stil Değişikliği
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    setLoading(true);
    map.setStyle(styleUrl(STYLES[activeStyle].id));

    map.once('style.load', () => {
      injectLayers(map, currentGeoJson);
      setLoading(false);
    });
  }, [activeStyle]); 

  // --- ZAMAN ÇİZELGESİ DEĞİŞTİĞİNDE HARİTAYI ANLIK GÜNCELLE ---
  useEffect(() => {
    const map = mapRef.current;
    if (map && mapReady) {
      const source = map.getSource(SOURCE_ID);
      if (source) {
        // setData çok hızlı çalışır, akıcı bir geçiş hissi verir
        source.setData(currentGeoJson);
        
        // Popup açıksa ve yıl değiştiyse kapat (yanlış bilgi göstermemek için)
        if (popupRef.current) {
          popupRef.current.remove();
          setSelected(null);
        }
      }
    }
  }, [currentGeoJson, mapReady]);

  // Popup İşlemleri
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }

    const p = selected;
    const name = p.name_1521 || p.name || 'Bilinmeyen Bölge';

    const html = `
      <div style="font-family:'Georgia',serif;min-width:190px;max-width:270px;">
        <div style="background:linear-gradient(135deg,#6b2f0e,#8B4513);
            margin:-12px -16px 12px;padding:12px 16px;border-radius:6px 6px 0 0;">
          <div style="font-size:10px;color:#d4a574;letter-spacing:1px;
              text-transform:uppercase;margin-bottom:3px;">Yıl: ${p.year}</div>
          <h3 style="margin:0;color:#FFF8DC;font-size:15px;
              text-shadow:1px 1px 2px rgba(0,0,0,.5);">${name}</h3>
        </div>
        ${p.owner ? `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:20px;">⚔️</span>
          <div>
            <div style="font-size:10px;color:#8B4513;text-transform:uppercase;
                letter-spacing:1px;font-weight:bold;">Hükümdar / Güç</div>
            <div style="font-size:13px;color:#3d2b1f;font-weight:600;">${p.owner}</div>
          </div>
        </div>` : ''}
      </div>`;

    const popup = new maplibregl.Popup({
      closeButton: true, closeOnClick: false,
      maxWidth: '300px', className: 'tarihi-popup',
    })
      .setLngLat(p.lngLat)
      .setHTML(html)
      .addTo(map);

    popup.on('close', () => setSelected(null));
    popupRef.current = popup;
  }, [selected]);

  const handleSaveKey = () => {
    const k = draftKey.trim();
    if (!k) return;
    setApiKey(k);
    setShowKeyPanel(false);
  };

  return (
    <>
      <style>{`
        /* ... Mevcut stilleriniz (popup, sidebar vs) aynı kalabilir ... */
        .tarihi-popup .maplibregl-popup-content { border-radius:8px; padding:12px 16px; background:#FFF8DC; border:2px solid #8B4513; box-shadow:0 4px 20px rgba(139,69,19,.35); font-family:'Georgia',serif; }
        .s-item { padding:9px 12px; cursor:pointer; border-radius:6px; margin-bottom:5px; transition:all .18s ease; font-size:13px; border:1px solid transparent; color:#d4a574; }
        .s-item:hover { background:rgba(255,248,220,.08); }
        .s-item.active { background:linear-gradient(135deg,#7a3a0c,#9e4d1a); border-color:#FFD700; color:#FFF8DC; font-weight:700; }
        .map-wrap::after { content:''; position:absolute; inset:0; pointer-events:none; box-shadow:inset 0 0 90px rgba(80,40,10,.2); z-index:5; }
        
        /* Zaman Çizelgesi (Slider) Stilleri */
        .timeline-container {
          position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
          background: rgba(44, 29, 14, 0.9); border: 2px solid #8B4513;
          padding: 15px 30px; border-radius: 12px; z-index: 200;
          box-shadow: 0 4px 20px rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          width: 80%; max-width: 600px; font-family: 'Georgia', serif;
        }
        .timeline-year-display {
          color: #FFD700; font-size: 24px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
          letter-spacing: 2px;
        }
        .timeline-slider {
          -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px;
          background: #5c4033; outline: none; transition: background 0.15s; cursor: pointer;
        }
        .timeline-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 22px; height: 22px;
          border-radius: 50%; background: #FFD700; border: 3px solid #8B4513;
          cursor: pointer; box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
          transition: transform 0.1s;
        }
        .timeline-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
        .timeline-labels {
          display: flex; justify-content: space-between; width: 100%;
          color: #d4a574; font-size: 12px; font-weight: bold;
        }
      `}</style>

      <div style={{ display:'flex', height:'100vh', fontFamily:'Georgia,serif' }}>
        
        {/* --- SIDEBAR KISMI AYNI --- */}
        <div style={{ /* (Mevcut sidebar container stilleri) */ width: sidebarOpen ? '268px' : '0', overflow:'hidden', transition:'all .3s ease', background:'linear-gradient(180deg,#3d2b1f 0%,#2c1d0e 100%)', display:'flex', flexDirection:'column', zIndex:100 }}>
             <div style={{ padding:'18px 16px 14px', borderBottom:'1px solid rgba(255,248,220,.1)', background:'rgba(0,0,0,.18)' }}>
              <div style={{fontSize:'22px',marginBottom:'3px'}}>🗺️</div>
              <h2 style={{margin:0,fontSize:'15px',letterSpacing:'1.5px',color:'#FFD700'}}>TARİHSEL HARİTA</h2>
            </div>
            
            <div style={{ padding:'13px 11px', flex:1, overflowY:'auto' }}>
              <div style={{ fontSize:'10px', letterSpacing:'2px', color:'#d4a574', marginBottom:'9px', fontWeight:'bold' }}>HARİTA STİLİ</div>
              {Object.entries(STYLES).map(([key, s]) => (
                <div key={key} className={`s-item ${activeStyle === key ? 'active' : ''}`} onClick={() => setActiveStyle(key)}>
                  {s.name}
                </div>
              ))}
            </div>
        </div>

        <div style={{flex:1,position:'relative'}} className="map-wrap">
          <button onClick={() => setSidebarOpen(v => !v)} style={{ position:'absolute', top:'14px', left:'14px', zIndex:200, background:'linear-gradient(135deg,#7a3a0c,#9e4d1a)', color:'#FFF8DC', border:'1px solid #FFD700', borderRadius:'6px', padding:'8px 12px', cursor:'pointer' }}>
            {sidebarOpen ? '◀' : '▶'}
          </button>

          {/* --- ZAMAN ÇİZELGESİ (SLIDER) --- */}
          {mapReady && (
            <div className="timeline-container">
              <div className="timeline-year-display">{currentYear}</div>
              <input 
                type="range" 
                className="timeline-slider"
                min={0} 
                max={YEARS.length - 1} 
                step={1}
                value={yearIndex}
                onChange={(e) => setYearIndex(Number(e.target.value))}
              />
              <div className="timeline-labels">
                <span>{YEARS[0]}</span>
                <span>{YEARS[YEARS.length - 1]}</span>
              </div>
            </div>
          )}

          <div ref={containerRef} style={{width:'100%',height:'100%'}} />
        </div>
      </div>
    </>
  );
}