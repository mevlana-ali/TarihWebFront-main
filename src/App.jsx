/**
 * TarihselHarita.jsx  –  MapTiler + MapLibre GL JS
 * ─────────────────────────────────────────────────
 * Kurulum:  npm install maplibre-gl
 * API Key:  https://cloud.maptiler.com  → ücretsiz kayıt → API Keys
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapData from './maps/1650.json';

// ── İstersen buraya direkt yapıştır ─────────────────────────────────────────
const DEFAULT_KEY = 'LnOZEqH5LZiYHN4SpJ9b'; // örn: 'LnOZEqH5...'
// ────────────────────────────────────────────────────────────────────────────

/**
 * DOĞRULANMIŞ MapTiler Style ID'leri
 * Kaynak: https://docs.maptiler.com/cloud/api/maps/
 * Tüm URL formatı: https://api.maptiler.com/maps/{ID}/style.json?key=KEY
 */
const STYLES = {
  ozel_haritam: { 
    name: '🏰 Benim Özel Haritam', 
    id: '019c7250-3e57-7b02-a180-182617f96e7e' 
  },
  topo_v2:      { name: '🗺️ Topo (Tarihi Benzeri)',    id: 'topo-v2' },
  streets_v2:   { name: '🏙️ Streets',                  id: 'streets-v2' },
  basic_v2:     { name: '📋 Basic (Temiz)',             id: 'basic-v2' },
  dataviz:      { name: '📊 Dataviz (Açık)',            id: 'dataviz' },
  dataviz_dark: { name: '🌑 Dataviz Koyu',             id: 'dataviz-dark' },
  outdoor_v2:   { name: '🌿 Outdoor',                  id: 'outdoor-v2' },
  hybrid:       { name: '🛰️ Satellite + Etiket',       id: 'hybrid' },
  openstreetmap:{ name: '🗾 OpenStreetMap',            id: 'openstreetmap' },
};

const SOURCE_ID = 'tarihi';
const FILL_ID   = 'tarihi-fill';
const HOVER_ID  = 'tarihi-hover';
const STROKE_ID = 'tarihi-stroke';

function firstSymbol(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) {
    if (l.type === 'symbol') return l.id;
  }
  return undefined;
}

const ENRICHED = {
  ...mapData,
  features: mapData.features.map((f, i) => ({ ...f, id: i })),
};

export default function TarihselHarita() {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const hoveredId    = useRef(null);
  const popupRef     = useRef(null);

  const [apiKey,       setApiKey]       = useState(DEFAULT_KEY);
  const [draftKey,     setDraftKey]     = useState(DEFAULT_KEY);
  const [showKeyPanel, setShowKeyPanel] = useState(!DEFAULT_KEY);
  const [activeStyle,  setActiveStyle]  = useState('ozel_haritam');
  const [mapReady,     setMapReady]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [selected,     setSelected]     = useState(null);

  const styleUrl = useCallback(
    (styleId) => `https://api.maptiler.com/maps/${styleId}/style.json?key=${apiKey}`,
    [apiKey]
  );

  const injectLayers = useCallback((map) => {
    [HOVER_ID, STROKE_ID, FILL_ID].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

    map.addSource(SOURCE_ID, { type: 'geojson', data: ENRICHED });
    const before = firstSymbol(map);

    map.addLayer({
      id: FILL_ID, type: 'fill', source: SOURCE_ID,
      paint: {
        'fill-color':   ['coalesce', ['get', 'fillColor'],   '#4a90d9'],
        'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.45],
      },
    }, before);

    map.addLayer({
      id: HOVER_ID, type: 'fill', source: SOURCE_ID,
      paint: {
        'fill-color':   '#ffffff',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.2, 0],
      },
    }, before);

    // ─── SINIRLARI GÜNCELLEDİĞİMİZ KISIM BAŞLANGIÇ ───────────────────────────
    map.addLayer({
      id: STROKE_ID, type: 'line', source: SOURCE_ID,
      layout: {
        'line-join': 'round', // Köşeleri yuvarlatır, daha düzgün görünür
        'line-cap': 'round'   // Çizgi uçlarını yuvarlatır
      },
      paint: {
        // Rengi sabitledik: Koyu kahverengi/siyah tonu, tarihi harita için ideal
        'line-color':   '#3d2b1f',
        // Kalınlığı artırdık: Uzakta 1.5px, yakında 4.5px
        'line-width':   [
          'interpolate', ['linear'], ['zoom'],
          3, 1.5,  // Zoom 3'te kalınlık 1.5px
          9, 4.5   // Zoom 9'da kalınlık 4.5px
        ],
        // Opaklığı 1 (tam net) yaptık
        'line-opacity': 1,
      },
    }, before);
    // ─── SINIRLARI GÜNCELLEDİĞİMİZ KISIM BİTİŞ ──────────────────────────────

    map.on('mousemove', FILL_ID, (e) => {
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
      setSelected({ ...p, lngLat: e.lngLat });
    });
  }, []);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;

    setError('');
    setMapReady(false);
    setLoading(true);

    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     styleUrl(STYLES[activeStyle].id),
      center:    [35, 39],
      zoom:      5.2,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      injectLayers(map);
      setMapReady(true);
      setLoading(false);
    });

    map.on('error', (e) => {
      console.error('MapLibre hata:', e);
      const msg = String(e?.error?.message ?? e?.error ?? '');
      if (/401|403|Unauthorized|Forbidden/i.test(msg)) {
        setError('❌ API Key geçersiz. Doğru key\'i cloud.maptiler.com\'dan al.');
      } else if (/404/i.test(msg)) {
        setError('❌ Harita stili bulunamadı (404). Başka bir stil seç.');
      } else if (/fetch|network/i.test(msg)) {
        setError('❌ Ağ bağlantısı kurulamadı.');
      } else if (msg) {
        setError(`❌ Hata: ${msg}`);
      }
      setLoading(false);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [apiKey]); // eslint-disable-line

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    setLoading(true);
    setError('');
    hoveredId.current = null;
    map.setStyle(styleUrl(STYLES[activeStyle].id));

    map.once('style.load', () => {
      injectLayers(map);
      setLoading(false);
    });

    // 404 için hata yakalama
    map.once('error', (e) => {
      const msg = String(e?.error?.message ?? '');
      if (/404/i.test(msg)) setError('❌ Bu stil bulunamadı (404). Başka bir stil seç.');
      setLoading(false);
    });
  }, [activeStyle]); // eslint-disable-line

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
              text-transform:uppercase;margin-bottom:3px;">Bölge</div>
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
        ${p.description ? `
        <div style="font-size:12px;color:#5c4033;line-height:1.6;font-style:italic;
            border-top:1px solid #d4a574;padding-top:8px;margin-top:6px;">
          ${p.description}
        </div>` : ''}
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #d4a574;
            font-size:10px;color:#a0826d;display:flex;gap:8px;">
          <span>📍 ${p.lngLat.lng.toFixed(2)}°D</span>
          <span>${p.lngLat.lat.toFixed(2)}°K</span>
        </div>
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
    setError('');
  };

  return (
    <>
      <style>{`
        .tarihi-popup .maplibregl-popup-content {
          border-radius:8px; padding:12px 16px; background:#FFF8DC;
          border:2px solid #8B4513;
          box-shadow:0 4px 20px rgba(139,69,19,.35),0 0 0 4px rgba(139,69,19,.1);
          font-family:'Georgia',serif;
        }
        .tarihi-popup .maplibregl-popup-tip { border-top-color:#8B4513; }
        .tarihi-popup .maplibregl-popup-close-button {
          color:#8B4513; font-size:18px; padding:2px 6px;
        }
        .tarihi-popup .maplibregl-popup-close-button:hover {
          background:rgba(139,69,19,.12); border-radius:4px;
        }
        .s-item {
          padding:9px 12px; cursor:pointer; border-radius:6px;
          margin-bottom:5px; transition:all .18s ease;
          font-size:13px; border:1px solid transparent; color:#d4a574;
        }
        .s-item:hover { background:rgba(255,248,220,.08); }
        .s-item.active {
          background:linear-gradient(135deg,#7a3a0c,#9e4d1a);
          border-color:#FFD700; color:#FFF8DC; font-weight:700;
        }
        .map-wrap::after {
          content:''; position:absolute; inset:0; pointer-events:none;
          box-shadow:inset 0 0 90px rgba(80,40,10,.2); z-index:5;
        }
        .key-input {
          width:100%; box-sizing:border-box;
          background:rgba(255,248,220,.08); border:1px solid rgba(212,165,116,.35);
          border-radius:5px; padding:8px 10px; color:#FFF8DC;
          font-size:12px; font-family:monospace; outline:none;
        }
        .key-input:focus { border-color:#FFD700; }
        .key-btn {
          width:100%; margin-top:8px; padding:8px;
          background:linear-gradient(135deg,#8B4513,#A0522D);
          color:#FFF8DC; border:1px solid #FFD700;
          border-radius:5px; cursor:pointer; font-size:13px;
          font-family:'Georgia',serif; font-weight:bold;
        }
        .key-btn:hover { opacity:.88; }
      `}</style>

      <div style={{ display:'flex', height:'100vh', fontFamily:'Georgia,serif' }}>

        <div style={{
          width: sidebarOpen ? '268px' : '0',
          minWidth: sidebarOpen ? '268px' : '0',
          overflow:'hidden', transition:'all .3s ease',
          background:'linear-gradient(180deg,#3d2b1f 0%,#2c1d0e 100%)',
          display:'flex', flexDirection:'column',
          boxShadow:'4px 0 24px rgba(0,0,0,.55)', zIndex:100,
        }}>

          <div style={{
            padding:'18px 16px 14px', flexShrink:0,
            borderBottom:'1px solid rgba(255,248,220,.1)',
            background:'rgba(0,0,0,.18)',
          }}>
            <div style={{fontSize:'22px',marginBottom:'3px'}}>🗺️</div>
            <h2 style={{margin:0,fontSize:'15px',letterSpacing:'1.5px',color:'#FFD700'}}>
              TARİHSEL HARİTA
            </h2>
            <p style={{margin:'3px 0 0',fontSize:'10px',color:'#d4a574',letterSpacing:'.5px'}}>
              Bölge Boyama Aracı
            </p>
          </div>

          {showKeyPanel && (
            <div style={{
              padding:'13px 14px 11px', flexShrink:0,
              borderBottom:'1px solid rgba(255,248,220,.08)',
              background:'rgba(0,0,0,.14)',
            }}>
              <div style={{
                fontSize:'10px', color:'#FFD700', letterSpacing:'1.5px',
                textTransform:'uppercase', marginBottom:'8px', fontWeight:'bold',
              }}>
                ⚙️ MapTiler API Key
              </div>
              <input
                className="key-input"
                type="text"
                placeholder="Buraya key'ini yapıştır..."
                value={draftKey}
                onChange={e => setDraftKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
              />
              <button className="key-btn" onClick={handleSaveKey}>
                ✓ Haritayı Yükle
              </button>
              <div style={{fontSize:'10px',color:'rgba(255,248,220,.3)',marginTop:'7px',lineHeight:'1.5'}}>
                → cloud.maptiler.com · ücretsiz key al
              </div>
            </div>
          )}

          <div style={{
            padding:'13px 11px', flex:1, overflowY:'auto',
            scrollbarWidth:'thin', scrollbarColor:'rgba(139,69,19,.4) transparent',
          }}>
            <div style={{
              fontSize:'10px', letterSpacing:'2px', color:'#d4a574',
              textTransform:'uppercase', marginBottom:'9px', fontWeight:'bold',
            }}>
              Harita Stili
            </div>
            {Object.entries(STYLES).map(([key, s]) => (
              <div
                key={key}
                className={`s-item ${activeStyle === key ? 'active' : ''}`}
                onClick={() => !loading && mapReady && setActiveStyle(key)}
                style={{ opacity: loading && activeStyle !== key ? .4 : 1 }}
              >
                {s.name}
              </div>
            ))}
          </div>

          <div style={{
            padding:'10px 14px', flexShrink:0,
            borderTop:'1px solid rgba(255,248,220,.07)',
            fontSize:'11px', color:'rgba(255,248,220,.28)', lineHeight:'1.7',
          }}>
            💡 Bölgeye tıkla → detay gör
            <br />
            <span
              onClick={() => setShowKeyPanel(v => !v)}
              style={{cursor:'pointer',color:'rgba(212,165,116,.45)',textDecoration:'underline'}}
            >
              API Key değiştir
            </span>
          </div>
        </div>

        <div style={{flex:1,position:'relative'}} className="map-wrap">

          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              position:'absolute', top:'14px', left:'14px', zIndex:200,
              background:'linear-gradient(135deg,#7a3a0c,#9e4d1a)',
              color:'#FFF8DC', border:'1px solid #FFD700',
              borderRadius:'6px', padding:'8px 12px',
              cursor:'pointer', fontSize:'15px',
              boxShadow:'0 2px 12px rgba(0,0,0,.45)', lineHeight:1,
            }}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>

          {(loading || error) && (
            <div style={{
              position:'absolute', top:'14px', left:'50%',
              transform:'translateX(-50%)', zIndex:200,
              background: error ? 'rgba(100,15,10,.96)' : 'rgba(50,30,10,.95)',
              color:'#FFF8DC', padding:'8px 18px',
              borderRadius:'20px', fontSize:'13px',
              border:`1px solid ${error ? '#e05040' : '#8B4513'}`,
              boxShadow:'0 2px 14px rgba(0,0,0,.45)',
              maxWidth:'80%', textAlign:'center',
            }}>
              {error || '⏳ Harita yükleniyor…'}
            </div>
          )}

          {!apiKey && (
            <div style={{
              position:'absolute', inset:0, zIndex:150,
              background:'rgba(25,12,3,.94)',
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:'14px',
            }}>
              <div style={{fontSize:'52px'}}>🗺️</div>
              <div style={{color:'#FFD700',fontSize:'20px',fontWeight:'bold',letterSpacing:'1.5px'}}>
                TARİHSEL HARİTA
              </div>
              <div style={{color:'#d4a574',fontSize:'14px',textAlign:'center',maxWidth:'340px',lineHeight:'1.8'}}>
                Haritayı başlatmak için sol panelden{' '}
                <strong style={{color:'#FFD700'}}>MapTiler API Key</strong>'ini gir.
                <br />
                <a href="https://cloud.maptiler.com" target="_blank" rel="noreferrer"
                  style={{color:'rgba(212,165,116,.6)',fontSize:'12px'}}>
                  cloud.maptiler.com → ücretsiz hesap aç
                </a>
              </div>
            </div>
          )}

          {mapReady && (
            <div style={{
              position:'absolute', bottom:'36px', right:'14px', zIndex:200,
              background:'rgba(35,18,5,.88)', color:'#d4a574',
              padding:'4px 10px', borderRadius:'4px', fontSize:'11px',
              border:'1px solid rgba(139,69,19,.45)', pointerEvents:'none',
            }}>
              {STYLES[activeStyle].name}
            </div>
          )}

          <div ref={containerRef} style={{width:'100%',height:'100%'}} />
        </div>
      </div>
    </>
  );
}