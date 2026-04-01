import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { X, Thermometer, Droplets, Wind, Sun, Cloud, Waves, Calendar, Sprout, Zap } from 'lucide-react';

interface StationData {
  metadata: { city: string; state: string; country?: string; wmo: string };
  yearly: { 
    avg_temp: number; 
    total_precip: number; 
    avg_humidity: number; 
    avg_wind: number; 
    total_solar: number; 
    avg_cloud: number;
    water_temp: number;
    growing_season: number;
    best_time: string;
    overview: string;
    solar_energy: number;
  };
  monthly: Record<string, { 
    temp_avg: number; 
    temp_max: number; 
    temp_min: number;
    humidity: number;
    wind: number;
    precip: number;
    solar: number;
    cloud: number;
  }>;
}

interface ClimateDashboardProps {
  stationId: string;
  onClose: () => void;
}

const ClimateDashboard: React.FC<ClimateDashboardProps> = ({ stationId, onClose }) => {
  const [data, setData] = useState<StationData | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const baseUrl = window.location.hostname === 'localhost' ? '' : '/weatherwhisper';
    fetch(`${baseUrl}/data/${stationId}.json`)
      .then(res => res.json())
      .then(setData)
      .catch(err => console.error('Failed to load station data:', err));
  }, [stationId]);

  useEffect(() => {
    if (!data || !chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
    
    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0,0,0,0.8)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff' }
      },
      legend: {
        data: ['平均温度', '降水量', '湿度'],
        textStyle: { color: 'rgba(255,255,255,0.6)' },
        top: 0
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: 'rgba(255,255,255,0.4)' }
      },
      yAxis: [
        {
          type: 'value',
          name: '温度 (°C)',
          axisLine: { show: false },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
          axisLabel: { color: 'rgba(255,255,255,0.4)' }
        },
        {
          type: 'value',
          name: '降水 (mm)',
          axisLine: { show: false },
          splitLine: { show: false },
          axisLabel: { color: 'rgba(255,255,255,0.4)' }
        }
      ],
      series: [
        {
          name: '平均温度',
          type: 'line',
          smooth: true,
          data: monthlySorted.map(m => m.temp_avg),
          itemStyle: { color: '#3b82f6' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59,130,246,0.3)' },
              { offset: 1, color: 'rgba(59,130,246,0)' }
            ])
          }
        },
        {
          name: '降水量',
          type: 'bar',
          yAxisIndex: 1,
          data: monthlySorted.map(m => m.precip),
          itemStyle: { color: 'rgba(96,165,250,0.4)' }
        }
      ]
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data]);

  if (!data) return null;

  const monthlySorted = Object.entries(data.monthly)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, value]) => value);
  const hottestIndex = monthlySorted.reduce((best, m, idx) => (m.temp_avg > monthlySorted[best].temp_avg ? idx : best), 0);
  const coldestIndex = monthlySorted.reduce((best, m, idx) => (m.temp_avg < monthlySorted[best].temp_avg ? idx : best), 0);
  const rainiestIndex = monthlySorted.reduce((best, m, idx) => (m.precip > monthlySorted[best].precip ? idx : best), 0);
  const humidMonths = monthlySorted.filter(m => m.humidity >= 75).length;
  const monthLabel = (idx: number) => `${idx + 1}月`;
  const weathersparkStyleSummary = `${data.metadata.city}夏季偏热潮湿、冬季偏冷；全年平均气温约${data.yearly.avg_temp}°C，通常在${Math.round(monthlySorted[coldestIndex].temp_min)}°C到${Math.round(monthlySorted[hottestIndex].temp_max)}°C之间变化。`;
  const bestVisitText = `根据旅游舒适度（温度、云量和降水综合），推荐出行时间为${data.yearly.best_time}。`;

  const metrics = [
    { icon: Thermometer, label: '平均气温', value: `${data.yearly.avg_temp}°C`, color: 'text-blue-400' },
    { icon: Droplets, label: '年降水量', value: `${data.yearly.total_precip}mm`, color: 'text-cyan-400' },
    { icon: Droplets, label: '平均湿度', value: `${data.yearly.avg_humidity}%`, color: 'text-indigo-400' },
    { icon: Wind, label: '平均风速', value: `${data.yearly.avg_wind}m/s`, color: 'text-teal-400' },
    { icon: Sun, label: '太阳辐射', value: `${data.yearly.total_solar} kWh/m²`, color: 'text-yellow-400' },
    { icon: Cloud, label: '平均云量', value: `${data.yearly.avg_cloud}%`, color: 'text-gray-400' },
    { icon: Waves, label: '水温 (估算)', value: `${data.yearly.water_temp}°C`, color: 'text-blue-500' },
    { icon: Calendar, label: '最佳访问', value: data.yearly.best_time, color: 'text-emerald-400' },
    { icon: Sprout, label: '生长季节', value: `${data.yearly.growing_season}天`, color: 'text-green-400' },
    { icon: Zap, label: '太阳能潜力', value: `${data.yearly.solar_energy}kWh`, color: 'text-orange-400' }
  ];

  return (
    <div className="fixed inset-y-4 right-4 w-[450px] bg-black/80 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl flex flex-col z-50 overflow-hidden animate-in slide-in-from-right duration-500">
      <div className="p-6 border-b border-white/10 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">{data.metadata.city}</h2>
          <p className="text-white/40 text-sm">{data.metadata.state} · WMO {data.metadata.wmo}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X className="text-white/60" size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        <section>
          <h3 className="text-xs font-bold text-white/30 uppercase tracking-[0.2em] mb-4">Climate Overview / 气候概况</h3>
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <p className="text-white/80 leading-relaxed text-sm">
              {data.yearly.overview}
            </p>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold text-white/30 uppercase tracking-[0.2em] mb-4">WeatherSpark Style / 全年气候解读</h3>
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-2 text-sm text-white/80 leading-relaxed">
            <p>{weathersparkStyleSummary}</p>
            <p>{bestVisitText}</p>
            <p>{`${monthLabel(hottestIndex)}最热（均温${monthlySorted[hottestIndex].temp_avg.toFixed(1)}°C），${monthLabel(coldestIndex)}最冷（均温${monthlySorted[coldestIndex].temp_avg.toFixed(1)}°C）。`}</p>
            <p>{`${monthLabel(rainiestIndex)}降水最多（${monthlySorted[rainiestIndex].precip.toFixed(1)} mm）；全年年降水量约${data.yearly.total_precip} mm。`}</p>
            <p>{`全年约有${humidMonths}个月平均湿度在75%以上，年平均风速${data.yearly.avg_wind} m/s，太阳辐射总量${data.yearly.total_solar} kWh/m²。`}</p>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold text-white/30 uppercase tracking-[0.2em] mb-4">Key Metrics / 关键指标</h3>
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((m, i) => (
              <div key={i} className="bg-white/5 rounded-2xl p-4 border border-white/5 flex items-center gap-4 group hover:bg-white/10 transition-colors">
                <div className={`p-2 rounded-xl bg-white/5 ${m.color}`}>
                  <m.icon size={20} />
                </div>
                <div>
                  <div className="text-[10px] text-white/30 uppercase font-bold">{m.label}</div>
                  <div className="text-sm font-bold text-white">{m.value}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold text-white/30 uppercase tracking-[0.2em] mb-4">Annual Trend / 年度趋势</h3>
          <div ref={chartRef} className="w-full h-64 bg-white/5 rounded-2xl border border-white/5 p-2" />
        </section>
      </div>

      <div className="p-6 bg-gradient-to-t from-black/40 to-transparent">
        <button 
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
          onClick={() => window.open(`https://www.google.com/search?q=${data.metadata.city}+weather+forecast`, '_blank')}
        >
          查看详细气象预报
        </button>
      </div>
    </div>
  );
};

export default ClimateDashboard;
