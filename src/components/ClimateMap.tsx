import React, { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { ScatterplotLayer, GeoJsonLayer } from '@deck.gl/layers';
import InterpolationLayer from '../layers/InterpolationLayer';
import maplibregl from 'maplibre-gl';

import 'maplibre-gl/dist/maplibre-gl.css';

const INITIAL_VIEW_STATE = {
  longitude: 105.0,
  latitude: 35.0,
  zoom: 3.5,
  pitch: 0,
  bearing: 0
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface StationFeature {
  type: string;
  geometry: { coordinates: [number, number] };
  properties: {
    id: string;
    city: string;
    avg_temp: number;
    avg_wind: number;
    total_precip: number;
  };
}

interface Props {
  selectedStation: string | null;
  setSelectedStation: (id: string | null) => void;
  currentMonth: number;
}

const ClimateMap: React.FC<Props> = ({ selectedStation, setSelectedStation, currentMonth }) => {
  const [data, setData] = useState<StationFeature[]>([]);
  const [metric, setMetric] = useState<'avg_temp' | 'avg_wind' | 'total_precip'>('avg_temp');
  const [hoverInfo, setHoverInfo] = useState<any>(null);

  useEffect(() => {
    fetch('/data/stations.geojson')
      .then(res => res.json())
      .then(json => {
        if (json && json.features) {
          setData(json.features);
        }
      })
      .catch(err => console.error("Failed to load stations data:", err));
  }, []);

  const layers: any[] = [
    new InterpolationLayer({
      id: 'idw-layer',
      data,
      getPosition: (d: any) => d.geometry.coordinates,
      getValue: (d: any) => d.properties[metric] || 0,
      p: 2.5,
      opacity: 0.5
    }),

    new ScatterplotLayer({
      id: 'stations-layer',
      data,
      pickable: true,
      radiusScale: 6,
      radiusMinPixels: 4,
      getPosition: (d: any) => d.geometry.coordinates,
      getFillColor: (d: any) => d.properties.id === selectedStation ? [255, 255, 0] : [255, 255, 255],
      getLineColor: [0, 0, 0],
      stroked: true,
      onClick: (info: any) => {
        if (info.object) setSelectedStation(info.object.properties.id);
      },
      onHover: (info: any) => setHoverInfo(info)
    })
  ];

  return (
    <div className="relative w-screen h-screen">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        getCursor={() => (hoverInfo ? 'pointer' : 'grab')}
      >
        <Map mapLib={maplibregl} mapStyle={MAP_STYLE} />
      </DeckGL>

      {/* Layer Switcher Controls */}
      <div className="absolute top-4 right-4 z-10 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-white shadow-2xl">
        <h3 className="text-sm font-bold mb-3 uppercase tracking-wider text-blue-400">WeatherWhisper Map</h3>
        <div className="flex flex-col gap-2">
          {([
            { id: 'avg_temp', label: 'Temperature', emoji: '🌡️' },
            { id: 'avg_wind', label: 'Wind Speed', emoji: '💨' },
            { id: 'total_precip', label: 'Precipitation', emoji: '💧' }
          ] as const).map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                metric === m.id ? 'bg-blue-600/60 shadow-lg scale-105' : 'hover:bg-white/10'
              }`}
            >
              <span className="text-lg">{m.emoji}</span>
              <span className="text-sm font-medium">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {hoverInfo && hoverInfo.object && (
        <div
          className="absolute z-20 pointer-events-none bg-black/80 backdrop-blur-md text-white p-3 rounded-lg border border-white/20 shadow-xl"
          style={{ left: hoverInfo.x + 15, top: hoverInfo.y + 15 }}
        >
          <div className="text-xs text-blue-400 font-bold mb-1">{hoverInfo.object.properties.id}</div>
          <div className="text-sm font-semibold">{hoverInfo.object.properties.city}</div>
          <hr className="my-2 border-white/10" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-gray-400">Value:</span>
            <span className="text-white font-mono">{hoverInfo.object.properties[metric]}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClimateMap;
