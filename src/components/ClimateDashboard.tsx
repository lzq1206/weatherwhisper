import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { X } from 'lucide-react';

interface StationData {
  metadata: { city: string; state: string; wmo: string };
  yearly: { avg_temp: number; avg_wind: number; total_precip: number };
  monthly: Record<string, { temp_avg: number; temp_max: number; temp_min: number; wind_avg: number; precip_sum: number }>;
  wind_rose: Record<string, Record<string, number>>;
}

interface Props {
  stationId: string | null;
  onClose: () => void;
}

const ClimateDashboard: React.FC<Props> = ({ stationId, onClose }) => {
  const [data, setData] = useState<StationData | null>(null);
  const tempChartRef = useRef<HTMLDivElement>(null);
  const windRoseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stationId) {
      fetch(`/data/${stationId}.json`)
        .then(res => res.json())
        .then(setData);
    }
  }, [stationId]);

  useEffect(() => {
    if (!data) return;

    // 1. Temperature Bands Chart (WeatherSpark Style)
    if (tempChartRef.current) {
      const chart = echarts.init(tempChartRef.current);
      const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
      const avg = months.map(m => data.monthly[m].temp_avg);
      const max = months.map(m => data.monthly[m].temp_max);
      const min = months.map(m => data.monthly[m].temp_min);

      chart.setOption({
        title: { text: 'Monthly Temperature Ranges', textStyle: { color: '#aaa', fontSize: 14 } },
        tooltip: { trigger: 'axis' },
        grid: { left: '10%', right: '5%', bottom: '15%' },
        xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
        yAxis: { type: 'value', axisLabel: { formatter: '{value}°C' } },
        series: [
          {
            name: 'Average',
            type: 'line',
            data: avg,
            lineStyle: { color: '#ff7f50', width: 3 },
            z: 10
          },
          {
            name: 'Range',
            type: 'line',
            data: max,
            lineStyle: { opacity: 0 },
            stack: 'range',
            areaStyle: { color: 'rgba(255, 127, 80, 0.2)' }
          },
          {
            name: 'Min',
            type: 'line',
            data: min.map((m, i) => max[i] - m), // Delta for stacking
            lineStyle: { opacity: 0 },
            stack: 'range',
            areaStyle: { color: 'rgba(255, 127, 80, 0.2)' }
          }
        ]
      });
      return () => chart.dispose();
    }
  }, [data]);

  useEffect(() => {
    if (!data) return;

    // 2. Wind Rose (Polar Chart)
    if (windRoseRef.current) {
      const chart = echarts.init(windRoseRef.current);
      const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
      const speedClasses = ["0-2", "2-5", "5-10", "10-15", "15+"];
      
      const series = speedClasses.map(sc => ({
        name: sc,
        type: 'bar',
        stack: 'wind',
        coordinateSystem: 'polar',
        data: directions.map(d => data.wind_rose[d]?.[sc] || 0)
      }));

      chart.setOption({
        title: { text: 'Wind Direction Distribution', textStyle: { color: '#aaa', fontSize: 14 } },
        polar: { radius: '65%' },
        angleAxis: { type: 'category', data: directions, startAngle: 90 },
        radiusAxis: { show: false },
        tooltip: { show: true },
        series
      });
      return () => chart.dispose();
    }
  }, [data]);

  if (!stationId) return null;

  return (
    <div className={`fixed right-0 top-0 h-full w-[450px] bg-black/90 backdrop-blur-xl border-l border-white/10 z-50 transition-all shadow-2xl overflow-y-auto ${stationId ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="p-6">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{data?.metadata.city || 'Loading...'}</h2>
            <p className="text-blue-400 text-sm">{data?.metadata.state}, WMO: {data?.metadata.wmo}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60">
            <X size={24} />
          </button>
        </div>

        {!data ? (
          <div className="flex items-center justify-center h-64 text-white/30">Loading Climate Data...</div>
        ) : (
          <div className="space-y-12">
            <div>
              <div ref={tempChartRef} className="w-full h-64" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                <div className="text-xs text-gray-400 uppercase mb-1">Annual Avg</div>
                <div className="text-2xl font-mono text-orange-400">{data.yearly.avg_temp.toFixed(1)}°C</div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                <div className="text-xs text-gray-400 uppercase mb-1">Total Precip</div>
                <div className="text-2xl font-mono text-blue-400">{data.yearly.total_precip.toFixed(0)}mm</div>
              </div>
            </div>

            <div>
              <div ref={windRoseRef} className="w-full h-80" />
            </div>

            <div className="text-[10px] text-white/20 italic text-center pb-8 leading-relaxed">
              * Data derived from OneBuilding.org EPW sets. Pre-computed yearly statistics for accurate interpolation.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClimateDashboard;
