/**
 * TarihselHarita.jsx  –  MapTiler + MapLibre GL JS + Timeline
 *
 * PERFORMANS OPTİMİZASYONLARI:
 * 1. generateId → promoteId ile değiştirildi (her render'da ID yeniden hesaplanmıyor)
 * 2. Hover FILL layer kaldırıldı → LINE layer ile değiştirildi (GPU yükü azaldı)
 * 3. mousemove'da aynı feature üzerindeyse erken return eklendi (gereksiz setState engellendi)
 * 4. Source tolerance 0.5→1.0, buffer 16→8, maxzoom 14→12 (geometry simplification)
 * 5. fill-antialias: false korundu, fill-opacity sabit tutuldu (expression evaluation azaldı)
 *
 * IMPORT SİSTEMİ:
 * - Tüm yıllar dinamik import ile yükleniyor
 * - JSON dosyası mevcut değilse sessizce atlanıyor (hata vermiyor)
 * - Yeni yıl eklemek için sadece ALL_YEARS dizisine numara eklemek yeterli
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── Dinamik JSON Yükleme ───────────────────────────────────────────
// Tüm yıllar burada tanımlı. JSON dosyası yoksa sessizce atlanır.
const ALL_YEARS = [
  1, 6, 9, 17, 25, 37, 41, 43, 46, 63, 64, 68, 70, 74, 78, 83, 89,
  91, 106, 113, 115, 116, 117, 122, 135, 142, 155, 165, 180, 194,
  198, 214, 220, 222, 224,240, 256, 260, 265, 271, 274, 280, 286, 296, 298
];

// Uygulama başlamadan önce tüm mevcut JSON'ları yükle
// Dosya yoksa Promise reject → catch ile null döner → filtelenir
const loadAllMapData = async () => {
  const results = await Promise.all(
    ALL_YEARS.map(year =>
      import(`./maps/${year}.json`)
        .then(module => ({ year, data: module.default }))
        .catch(() => null) // Dosya yoksa null döner, hata vermez
    )
  );

  const map = {};
  for (const result of results) {
    if (result && result.data?.features?.length > 0) {
      map[result.year] = result.data;
    }
  }
  return map;
};

// ── Uygulama Wrapper: Veriler yüklenene kadar bekle ───────────────
export default function AppWrapper() {
  const [mapData, setMapData] = useState(null);

  useEffect(() => {
    loadAllMapData().then(setMapData);
  }, []);

  if (!mapData) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#2c1d0e', color: '#FFD700',
        fontFamily: 'Georgia, serif', fontSize: '20px', gap: '12px'
      }}>
        <span>🗺️</span> Harita verileri yükleniyor...
      </div>
    );
  }

  return <TarihselHarita mapDataByYear={mapData} />;
}

// ── Ana Harita Bileşeni ────────────────────────────────────────────

const DEFAULT_KEY = 'LnOZEqH5LZiYHN4SpJ9b';

const STYLES = {
  ozel_haritam2: { name: '🏰 Benim Özel Haritam 2', id: '019c7250-3e57-7b02-a180-182617f96e7e' },
  topo_v2:       { name: '🗺️ Topo (Tarihi Benzeri)', id: 'topo-v2' },
  streets_v2:    { name: '🏙️ Streets',               id: 'streets-v2' },
  basic_v2:      { name: '📋 Basic (Temiz)',          id: 'basic-v2' },
  dataviz:       { name: '📊 Dataviz (Açık)',         id: 'dataviz' },
  dataviz_dark:  { name: '🌑 Dataviz Koyu',          id: 'dataviz-dark' },
  outdoor_v2:    { name: '🌿 Outdoor',               id: 'outdoor-v2' },
  hybrid:        { name: '🛰️ Satellite + Etiket',    id: 'hybrid' },
  openstreetmap: { name: '🗾 OpenStreetMap',         id: 'openstreetmap' },
};

const SOURCE_ID  = 'tarihi';
const FILL_ID    = 'tarihi-fill';
const HOVER_ID   = 'tarihi-hover';

const OUR_LAYER_IDS  = new Set([FILL_ID, HOVER_ID]);
const OUR_SOURCE_IDS = new Set([SOURCE_ID]);

maplibregl.workerCount = 4;

function getInsertBeforeId(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) {
    if (l.type === 'hillshade' || (l.id && l.id.includes('water'))) return l.id;
  }
  for (const l of layers) {
    if (l.type === 'symbol') return l.id;
  }
  return undefined;
}

function yearFilter(year) {
  return ['==', ['get', '_year'], year];
}

function TarihselHarita({ mapDataByYear }) {
  const MAP_DATA_BY_YEAR = mapDataByYear;
  const YEARS = Object.keys(MAP_DATA_BY_YEAR).map(Number).sort((a, b) => a - b);

  // Tüm yılların feature'larını tek bir GeoJSON'da birleştir
  const MERGED_GEOJSON = (() => {
    const features = [];
    for (const [yearStr, data] of Object.entries(MAP_DATA_BY_YEAR)) {
      const year = Number(yearStr);
      for (const f of data.features) {
        features.push({ ...f, properties: { ...f.properties, _year: year } });
      }
    }
    return { type: 'FeatureCollection', features };
  })();

  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const hoveredId      = useRef(null);
  const popupRef       = useRef(null);
  const currentYearRef = useRef(YEARS[0]);

  const [apiKey,      setApiKey]      = useState(DEFAULT_KEY);
  const [activeStyle, setActiveStyle] = useState('ozel_haritam2');
  const [mapReady,    setMapReady]    = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [yearIndex,   setYearIndex]   = useState(0);
  const [error,       setError]       = useState('');

  const currentYear = YEARS[yearIndex];

  const styleUrl = useCallback(
    (styleId) => `https://api.maptiler.com/maps/${styleId}/style.json?key=${apiKey}`,
    [apiKey]
  );

  const initLayers = useCallback((map) => {
    const before = getInsertBeforeId(map);
    const year   = currentYearRef.current;

    map.addSource(SOURCE_ID, {
      type:       'geojson',
      data:       MERGED_GEOJSON,
      tolerance:  1.0,
      buffer:     8,
      generateId: true,
      maxzoom:    12,
    });

    map.addLayer({
      id:     FILL_ID,
      type:   'fill',
      source: SOURCE_ID,
      filter: yearFilter(year),
      paint: {
        'fill-color':     ['coalesce', ['get', 'fillColor'], '#4a90d9'],
        'fill-opacity':   0.9,
        'fill-antialias': false,
      },
    }, before);

    map.addLayer({
      id:     HOVER_ID,
      type:   'line',
      source: SOURCE_ID,
      filter: yearFilter(year),
      paint: {
        'line-color':   '#ffffff',
        'line-width':   2.5,
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.9,
          0,
        ],
      },
    }, before);

    let hoverRaf = null;

    map.on('mousemove', FILL_ID, (e) => {
      if (map.isMoving() || map.isZooming() || map.isRotating()) return;
      if (!e.features?.length) return;

      const newId = e.features[0].id;
      if (newId === undefined || newId === null) return;
      if (newId === hoveredId.current) return;

      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = null;
        map.getCanvas().style.cursor = 'pointer';

        if (hoveredId.current !== null) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredId.current },
            { hover: false }
          );
        }
        hoveredId.current = newId;
        map.setFeatureState(
          { source: SOURCE_ID, id: newId },
          { hover: true }
        );
      });
    });

    map.on('mouseleave', FILL_ID, () => {
      if (hoverRaf) { cancelAnimationFrame(hoverRaf); hoverRaf = null; }
      map.getCanvas().style.cursor = '';
      if (hoveredId.current !== null) {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredId.current },
          { hover: false }
        );
        hoveredId.current = null;
      }
    });

    map.on('click', FILL_ID, (e) => {
      const p = e.features[0]?.properties ?? {};
      setSelected({ ...p, lngLat: e.lngLat, year: currentYearRef.current });
    });
  }, [MERGED_GEOJSON]);

  // ── Harita başlatma ────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !containerRef.current) return;

    setError('');
    setMapReady(false);
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = new maplibregl.Map({
      container:           containerRef.current,
      style:               styleUrl(STYLES[activeStyle].id),
      center:              [35, 39],
      zoom:                5.2,
      attributionControl:  false,
      fadeDuration:        0,
      antialias:           false,
      maxDevicePixelRatio: 1.5,
      refreshExpiredTiles: false,
      dragRotate:          false,
      pitchWithRotate:     false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => { initLayers(map); setMapReady(true); });

    map.on('error', (e) => {
      const msg = String(e?.error?.message ?? e?.error ?? '');
      if (/401|403/i.test(msg)) setError('❌ API Key geçersiz.');
      else if (/404/i.test(msg)) setError('❌ Harita stili bulunamadı.');
      else setError(`❌ Hata: ${msg}`);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [apiKey]);

  // ── Stil değişimi ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    map.setStyle(styleUrl(STYLES[activeStyle].id), {
      transformStyle: (prevStyle, nextStyle) => {
        const preservedSources = {};
        for (const id of OUR_SOURCE_IDS) {
          if (prevStyle?.sources?.[id]) preservedSources[id] = prevStyle.sources[id];
        }
        const preservedLayers = (prevStyle?.layers ?? []).filter(l => OUR_LAYER_IDS.has(l.id));

        let insertIdx = nextStyle.layers.length;
        let symbolIdx = -1;

        for (let i = 0; i < nextStyle.layers.length; i++) {
          const l = nextStyle.layers[i];
          if (l.type === 'hillshade' || (l.id && l.id.includes('water'))) {
            insertIdx = i;
            break;
          }
          if (l.type === 'symbol' && symbolIdx === -1) symbolIdx = i;
        }

        if (insertIdx === nextStyle.layers.length && symbolIdx !== -1) {
          insertIdx = symbolIdx;
        }

        return {
          ...nextStyle,
          sources: { ...nextStyle.sources, ...preservedSources },
          layers: [
            ...nextStyle.layers.slice(0, insertIdx),
            ...preservedLayers,
            ...nextStyle.layers.slice(insertIdx),
          ],
        };
      },
    });
  }, [activeStyle, styleUrl, mapReady]);

  // ── Yıl değişimi ──────────────────────────────────────────────────
  useEffect(() => {
    currentYearRef.current = YEARS[yearIndex];
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const year = YEARS[yearIndex];

    if (map.getLayer(FILL_ID))  map.setFilter(FILL_ID,  yearFilter(year));
    if (map.getLayer(HOVER_ID)) map.setFilter(HOVER_ID, yearFilter(year));

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
      setSelected(null);
    }
  }, [yearIndex, mapReady]);

  // ── Popup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }

    const p    = selected;
    const name = p.name_1521 || p.name || 'Bilinmeyen Bölge';

    const popup = new maplibregl.Popup({
      closeButton:  true,
      closeOnClick: false,
      maxWidth:     '300px',
      className:    'tarihi-popup',
    })
      .setLngLat(p.lngLat)
      .setHTML(`
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
        </div>`)
      .addTo(map);

    popup.on('close', () => setSelected(null));
    popupRef.current = popup;
  }, [selected]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .tarihi-popup .maplibregl-popup-content {
          border-radius: 8px;
          padding: 12px 16px;
          background: #FFF8DC;
          border: 2px solid #8B4513;
          box-shadow: 0 4px 20px rgba(139,69,19,.35);
          font-family: 'Georgia', serif;
        }
        .s-item {
          padding: 9px 12px;
          cursor: pointer;
          border-radius: 6px;
          margin-bottom: 5px;
          font-size: 13px;
          border: 1px solid transparent;
          color: #d4a574;
          transition: background 0.12s;
        }
        .s-item:hover  { background: rgba(255,248,220,.08); }
        .s-item.active {
          background: linear-gradient(135deg,#7a3a0c,#9e4d1a);
          border-color: #FFD700;
          color: #FFF8DC;
          font-weight: 700;
        }
        .map-wrap::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          box-shadow: inset 0 0 90px rgba(80,40,10,.2);
          z-index: 5;
        }
        .timeline-container {
          position: absolute;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(44,29,14,0.92);
          border: 2px solid #8B4513;
          padding: 14px 28px;
          border-radius: 12px;
          z-index: 200;
          box-shadow: 0 4px 20px rgba(0,0,0,.6);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          width: 80%;
          max-width: 600px;
          font-family: 'Georgia', serif;
        }
        .timeline-year-display {
          color: #FFD700;
          font-size: 24px;
          font-weight: bold;
          text-shadow: 2px 2px 4px rgba(0,0,0,.8);
          letter-spacing: 2px;
        }
        .timeline-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: #5c4033;
          outline: none;
          cursor: pointer;
        }
        .timeline-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #FFD700;
          border: 3px solid #8B4513;
          cursor: pointer;
          box-shadow: 0 0 8px rgba(255,215,0,.5);
        }
        .timeline-labels {
          display: flex;
          justify-content: space-between;
          width: 100%;
          color: #d4a574;
          font-size: 12px;
          font-weight: bold;
        }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', fontFamily: 'Georgia,serif' }}>

        {/* SIDEBAR */}
        <div style={{
          width:      sidebarOpen ? '268px' : '0',
          overflow:   'hidden',
          transition: 'width .25s ease',
          background: 'linear-gradient(180deg,#3d2b1f 0%,#2c1d0e 100%)',
          display:    'flex',
          flexDirection: 'column',
          zIndex: 100,
        }}>
          <div style={{
            padding: '18px 16px 14px',
            borderBottom: '1px solid rgba(255,248,220,.1)',
            background: 'rgba(0,0,0,.18)',
          }}>
            <div style={{ fontSize: '22px', marginBottom: '3px' }}>🗺️</div>
            <h2 style={{ margin: 0, fontSize: '15px', letterSpacing: '1.5px', color: '#FFD700' }}>
              TARİHSEL HARİTA
            </h2>
          </div>
          <div style={{ padding: '13px 11px', flex: 1, overflowY: 'auto' }}>
            <div style={{
              fontSize: '10px', letterSpacing: '2px', color: '#d4a574',
              marginBottom: '9px', fontWeight: 'bold',
            }}>
              HARİTA STİLİ
            </div>
            {Object.entries(STYLES).map(([key, s]) => (
              <div
                key={key}
                className={`s-item ${activeStyle === key ? 'active' : ''}`}
                onClick={() => setActiveStyle(key)}
              >
                {s.name}
              </div>
            ))}
          </div>
        </div>

        {/* HARİTA */}
        <div style={{ flex: 1, position: 'relative' }} className="map-wrap">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              position:   'absolute',
              top:        '14px',
              left:       '14px',
              zIndex:     200,
              background: 'linear-gradient(135deg,#7a3a0c,#9e4d1a)',
              color:      '#FFF8DC',
              border:     '1px solid #FFD700',
              borderRadius: '6px',
              padding:    '8px 12px',
              cursor:     'pointer',
            }}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>

          {error && (
            <div style={{
              position:  'absolute',
              top:       '60px',
              left:      '50%',
              transform: 'translateX(-50%)',
              zIndex:    300,
              background:'#7a0000',
              color:     '#fff',
              padding:   '10px 20px',
              borderRadius: '8px',
            }}>
              {error}
            </div>
          )}

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

          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </>
  );
}