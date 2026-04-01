import React, { useState, useEffect, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import { Map } from 'react-map-gl/maplibre';
import InterpolationLayer from '../layers/InterpolationLayer';

interface StationFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    city: string;
    [key: string]: any;
  };
}

interface ClimateMapProps {
  onStationSelect: (stationId: string) => void;
  selectedMonth: number;
}

const METRICS = [
  { id: 'avg_temp', label: '温度', unit: '°C' },
  { id: 'total_precip', label: '降水', unit: 'mm' },
  { id: 'avg_humidity', label: '湿度', unit: '%' },
  { id: 'avg_wind', label: '刮风', unit: 'm/s' },
  { id: 'total_solar', label: '太阳', unit: 'kWh/m²' },
  { id: 'avg_cloud', label: '云彩', unit: '%' },
  { id: 'water_temp', label: '水温', unit: '°C' },
  { id: 'growing_season', label: '生长季节', unit: '天' },
  { id: 'solar_energy', label: '太阳能', unit: 'kWh' },
  { id: 'best_time', label: '最佳访问时间', unit: '' },
  { id: 'overview', label: '气候概述', unit: '' },
];

const ClimateMap: React.FC<ClimateMapProps> = ({ onStationSelect, selectedMonth }) => {
  const [data, setData] = useState<StationFeature[]>([]);
  const [metric, setMetric] = useState('avg_temp');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const baseUrl = window.location.hostname === 'localhost' ? '' : '/weatherwhisper';
    fetch(`${baseUrl}/data/stations.geojson`)
      .then(res => res.json())
      .then(json => setData(json.features))
      .catch(err => console.error('Failed to load stations:', err));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => setTheme(mq.matches ? 'dark' : 'light');
    applyTheme();
    mq.addEventListener('change', applyTheme);
    return () => mq.removeEventListener('change', applyTheme);
  }, []);

  const layers = useMemo(() => [
    new InterpolationLayer({
      id: 'idw-layer',
      data,
      getPosition: (d: any) => d.geometry.coordinates,
      getValue: (d: any) => d.properties[metric] || 0,
      p: 2.5,
      opacity: 0.5,
      pickable: false
    }),
    new ScatterplotLayer({
      id: 'stations-layer',
      data,
      pickable: true,
      radiusScale: 6,
      radiusMinPixels: 4,
      getPosition: (d: any) => d.geometry.coordinates,
      getFillColor: [255, 255, 255, 200],
      getLineColor: [0, 0, 0],
      lineWidthMinPixels: 1,
      onClick: (info: any) => {
        if (info.object) {
          onStationSelect(info.object.properties.id);
        }
      }
    })
  ], [data, metric, onStationSelect]);

  const viewState = {
    longitude: 105,
    latitude: 35,
    zoom: 3.5,
    pitch: 0,
    bearing: 0
  };

  return (
    <div className="relative w-full h-[600px] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        <div className="bg-black/80 backdrop-blur-xl p-4 rounded-2xl border border-white/20 shadow-2xl max-w-[280px]">
          <label className="text-white/50 text-[10px] font-bold uppercase tracking-[0.2em] mb-3 block">
            CLIMATE METRICS / 气候指标
          </label>
          <div className="grid grid-cols-2 gap-2">
            {METRICS.map(m => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 border ${
                  metric === m.id 
                    ? 'bg-blue-600/90 text-white border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-[1.02]' 
                    : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex flex-col items-start gap-0.5">
                  <span>{m.label}</span>
                  <span className="text-[9px] opacity-50 font-normal">{m.unit}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <DeckGL
        initialViewState={viewState}
        controller={true}
        layers={layers}
        getTooltip={({ object }: any) => {
          if (!object) return null;
          const m = METRICS.find(item => item.id === metric);
          return {
            html: `
              <div style="background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); font-family: sans-serif;">
                <div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">${object.properties.city}</div>
                <div style="display: flex; justify-content: space-between; gap: 20px; align-items: center;">
                  <span style="opacity: 0.7; font-size: 11px;">${m?.label}</span>
                  <span style="font-weight: 500; color: #60a5fa;">${object.properties[metric]}${m?.unit}</span>
                </div>
              </div>
            `,
            style: {
              backgroundColor: 'transparent',
              padding: '0px'
            }
          };
        }}
      >
        <Map
          mapStyle={theme === 'dark' 
            ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
            : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
          }
        />
      </DeckGL>
    </div>
  );
};

export default ClimateMap;
