import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import {
  X,
  Thermometer,
  Droplets,
  Wind,
  Sun,
  Cloud,
  Waves,
  Calendar,
  Sprout,
  MapPin,
  ArrowUpRight,
} from 'lucide-react';

interface StationData {
  metadata: { city: string; state: string; country?: string; wmo: string; lat?: number; lon?: number; elev?: number };
  yearly: {
    avg_temp: number;
    total_precip: number;
    avg_humidity: number;
    avg_wind: number;
    total_solar: number;
    avg_cloud: number;
    avg_opaque_cloud?: number;
    avg_visibility?: number;
    water_temp: number;
    growing_season: number;
    best_time: string;
    best_tourism_months?: string;
    tourism_score_avg?: number;
    tourism_peak_month?: number | null;
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
    opaque_cloud?: number;
    visibility?: number;
    sunny_rate?: number;
    tourism_score?: number;
    comfort_label?: string;
  }>;
}

interface ClimateDashboardProps {
  stationId: string;
  selectedMonth: number;
  onClose?: () => void;
}

const BASE_PATH = import.meta.env.BASE_URL;
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function computeTourismScore(item: { temp_avg: number; humidity: number; cloud: number }) {
  const temp = Number(item.temp_avg);
  const humidity = Number(item.humidity);
  const cloud = Number(item.cloud);
  const opaqueCloud = Number((item as any).opaque_cloud ?? cloud);
  const visibility = Number((item as any).visibility ?? 10);
  const cloudiness = 0.45 * cloud + 0.55 * opaqueCloud;
  const visibilityBonus = Math.max(0, Math.min(8, (visibility - 5) / 1.5));
  const sunnyRate = Math.max(0, Math.min(100, (100 - cloudiness) * 0.28 + visibilityBonus * 2.5));
  const tempScore = Math.max(0, 1 - Math.abs(temp - 23) / 13);
  const humidityScore = Math.max(0, 1 - Math.abs(humidity - 55) / 45);
  const sunnyScore = sunnyRate / 100;
  const score = Math.round((0.45 * tempScore + 0.25 * humidityScore + 0.30 * sunnyScore) * 10 * 10) / 10;
  const comfortLabel = temp >= 18 && temp <= 28 && humidity >= 35 && humidity <= 75 && sunnyRate >= 18
    ? '舒适'
    : temp >= 15 && temp <= 30 && humidity >= 30 && humidity <= 80
      ? '可接受'
      : '偏不舒适';
  return { sunnyRate: Math.round(sunnyRate * 10) / 10, score, comfortLabel };
}

const ClimateDashboard: React.FC<ClimateDashboardProps> = ({ stationId, selectedMonth, onClose }) => {
  const [data, setData] = useState<StationData | null>(null);
  const tempChartRef = useRef<HTMLDivElement>(null);
  const climateChartRef = useRef<HTMLDivElement>(null);
  const tourismChartRef = useRef<HTMLDivElement>(null);
  const sunshineChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stationId) return;
    fetch(`${BASE_PATH}/data/${stationId}.json`)
      .then(res => res.json())
      .then(setData)
      .catch(err => console.error('Failed to load station data:', err));
  }, [stationId]);

  const monthlySorted = useMemo(
    () =>
      data
        ? Object.entries(data.monthly)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, value], idx) => {
              const computed = computeTourismScore(value as any);
              return {
                month: idx + 1,
                opaque_cloud: value.opaque_cloud,
                visibility: value.visibility,
                sunny_rate: value.sunny_rate ?? computed.sunnyRate,
                tourism_score: value.tourism_score ?? computed.score,
                comfort_label: value.comfort_label ?? computed.comfortLabel,
                ...value,
              };
            })
        : [],
    [data]
  );

  const selectedIndex = Math.min(Math.max(selectedMonth, 1), 12) - 1;
  const selected = monthlySorted[selectedIndex];
  const hottest = monthlySorted.reduce((best, item, idx) => (item.temp_avg > monthlySorted[best].temp_avg ? idx : best), 0);
  const coldest = monthlySorted.reduce((best, item, idx) => (item.temp_avg < monthlySorted[best].temp_avg ? idx : best), 0);
  const wettest = monthlySorted.reduce((best, item, idx) => (item.precip > monthlySorted[best].precip ? idx : best), 0);
  const driest = monthlySorted.reduce((best, item, idx) => (item.precip < monthlySorted[best].precip ? idx : best), 0);
  const humidMonths = monthlySorted.filter(item => item.humidity >= 75).length;
  const cloudiest = monthlySorted.reduce((best, item, idx) => (item.cloud > monthlySorted[best].cloud ? idx : best), 0);
  const clearest = monthlySorted.reduce((best, item, idx) => (item.cloud < monthlySorted[best].cloud ? idx : best), 0);
  const bestTourismMonth = monthlySorted.reduce((best, item, idx) => (item.tourism_score > monthlySorted[best].tourism_score ? idx : best), 0);
  const bestTourismScore = monthlySorted[bestTourismMonth]?.tourism_score ?? computeTourismScore(monthlySorted[bestTourismMonth] || { temp_avg: 0, humidity: 0, cloud: 100 }).score;
  const tourismAvg = monthlySorted.length ? monthlySorted.reduce((sum, item) => sum + item.tourism_score, 0) / monthlySorted.length : 0;
  const bestTourismMonths = data?.yearly.best_tourism_months || `${MONTHS[bestTourismMonth]}`;

  useEffect(() => {
    if (!data || !tempChartRef.current || monthlySorted.length !== 12) return;

    const chart = echarts.init(tempChartRef.current);
    const option = {
      backgroundColor: 'transparent',
      animationDuration: 400,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(2,6,23,0.92)',
        borderColor: 'rgba(148,163,184,.18)',
        textStyle: { color: '#fff' },
        axisPointer: { type: 'line' },
      },
      legend: {
        data: ['平均温度', '最高温度', '最低温度'],
        textStyle: { color: '#cbd5e1' },
        top: 4,
      },
      grid: { left: '3%', right: '3%', top: 48, bottom: '6%', containLabel: true },
      xAxis: {
        type: 'category',
        data: MONTHS,
        axisLine: { lineStyle: { color: 'rgba(148,163,184,.20)' } },
        axisLabel: { color: '#94a3b8' },
      },
      yAxis: {
        type: 'value',
        name: '温度 (°C)',
        nameTextStyle: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,.10)' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          name: '平均温度',
          type: 'line',
          smooth: true,
          data: monthlySorted.map(item => item.temp_avg),
          symbolSize: 8,
          lineStyle: { width: 3, color: '#38bdf8' },
          itemStyle: { color: '#38bdf8' },
          areaStyle: {
            opacity: 0.18,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(56,189,248,.45)' },
              { offset: 1, color: 'rgba(56,189,248,0)' },
            ]),
          },
          markPoint: {
            data: [{ name: '高温', value: monthlySorted[hottest].temp_avg, xAxis: MONTHS[hottest], yAxis: monthlySorted[hottest].temp_avg }],
            label: { color: '#e2e8f0' },
          },
        },
        {
          name: '最高温度',
          type: 'line',
          smooth: true,
          data: monthlySorted.map(item => item.temp_max),
          symbolSize: 6,
          lineStyle: { width: 2, color: '#f97316' },
          itemStyle: { color: '#f97316' },
        },
        {
          name: '最低温度',
          type: 'line',
          smooth: true,
          data: monthlySorted.map(item => item.temp_min),
          symbolSize: 6,
          lineStyle: { width: 2, color: '#60a5fa' },
          itemStyle: { color: '#60a5fa' },
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, monthlySorted, hottest]);

  useEffect(() => {
    if (!data || !climateChartRef.current || monthlySorted.length !== 12) return;

    const chart = echarts.init(climateChartRef.current);
    const option = {
      backgroundColor: 'transparent',
      animationDuration: 400,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(2,6,23,0.92)',
        borderColor: 'rgba(148,163,184,.18)',
        textStyle: { color: '#fff' },
      },
      legend: {
        data: ['降水量', '湿度', '云量', '晴天率'],
        textStyle: { color: '#cbd5e1' },
        top: 4,
      },
      grid: { left: '3%', right: '3%', top: 48, bottom: '6%', containLabel: true },
      xAxis: {
        type: 'category',
        data: MONTHS,
        axisLine: { lineStyle: { color: 'rgba(148,163,184,.20)' } },
        axisLabel: { color: '#94a3b8' },
      },
      yAxis: [
        {
          type: 'value',
          name: '降水 (mm)',
          nameTextStyle: { color: '#94a3b8' },
          splitLine: { lineStyle: { color: 'rgba(148,163,184,.10)' } },
          axisLabel: { color: '#94a3b8' },
        },
        {
          type: 'value',
          name: '湿度 / 云量 / 晴天率',
          nameTextStyle: { color: '#94a3b8' },
          splitLine: { show: false },
          axisLabel: { color: '#94a3b8' },
        },
      ],
      series: [
        {
          name: '降水量',
          type: 'bar',
          data: monthlySorted.map(item => item.precip),
          barMaxWidth: 22,
          itemStyle: { color: 'rgba(59,130,246,.5)', borderRadius: [8, 8, 0, 0] },
          emphasis: { itemStyle: { color: 'rgba(59,130,246,.75)' } },
          markLine: {
            symbol: 'none',
            lineStyle: { color: 'rgba(248,250,252,.35)', type: 'dashed' },
            data: [{ xAxis: MONTHS[selectedIndex] }],
          },
        },
        {
          name: '湿度',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: monthlySorted.map(item => item.humidity),
          symbolSize: 6,
          lineStyle: { width: 2.5, color: '#22c55e' },
          itemStyle: { color: '#22c55e' },
        },
        {
          name: '云量',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: monthlySorted.map(item => item.cloud),
          symbolSize: 6,
          lineStyle: { width: 2.5, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
        },
        {
          name: '晴天率',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: monthlySorted.map(item => item.sunny_rate ?? computeTourismScore(item).sunnyRate),
          symbolSize: 6,
          lineStyle: { width: 2.5, color: '#38bdf8' },
          itemStyle: { color: '#38bdf8' },
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, monthlySorted, selectedIndex]);

  useEffect(() => {
    if (!data || !tourismChartRef.current || monthlySorted.length !== 12) return;

    const chart = echarts.init(tourismChartRef.current);
    const option = {
      backgroundColor: 'transparent',
      animationDuration: 400,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(2,6,23,0.92)',
        borderColor: 'rgba(148,163,184,.18)',
        textStyle: { color: '#fff' },
      },
      grid: { left: '3%', right: '3%', top: 42, bottom: '6%', containLabel: true },
      xAxis: {
        type: 'category',
        data: MONTHS,
        axisLine: { lineStyle: { color: 'rgba(148,163,184,.20)' } },
        axisLabel: { color: '#94a3b8' },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 10,
        name: '旅游评分 (0-10)',
        nameTextStyle: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,.10)' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          name: '旅游评分',
          type: 'line',
          smooth: true,
          data: monthlySorted.map(item => item.tourism_score ?? computeTourismScore(item).score),
          symbolSize: 8,
          lineStyle: { width: 3, color: '#f472b6' },
          itemStyle: { color: '#f472b6' },
          areaStyle: {
            opacity: 0.18,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(244,114,182,.36)' },
              { offset: 1, color: 'rgba(244,114,182,0)' },
            ]),
          },
          markPoint: {
            data: [{ name: '最佳月', value: monthlySorted[bestTourismMonth].tourism_score ?? 0, xAxis: MONTHS[bestTourismMonth], yAxis: monthlySorted[bestTourismMonth].tourism_score ?? 0 }],
            label: { color: '#e2e8f0' },
          },
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, monthlySorted, bestTourismMonth]);

  useEffect(() => {
    if (!data || !sunshineChartRef.current || monthlySorted.length !== 12) return;

    const chart = echarts.init(sunshineChartRef.current);
    const option = {
      backgroundColor: 'transparent',
      animationDuration: 400,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(2,6,23,0.92)',
        borderColor: 'rgba(148,163,184,.18)',
        textStyle: { color: '#fff' },
      },
      grid: { left: '3%', right: '3%', top: 36, bottom: '6%', containLabel: true },
      xAxis: {
        type: 'category',
        data: MONTHS,
        axisLine: { lineStyle: { color: 'rgba(148,163,184,.20)' } },
        axisLabel: { color: '#94a3b8' },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 40,
        name: '晴天率（估）%',
        nameTextStyle: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,.10)' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          name: '晴天率（估）',
          type: 'line',
          smooth: true,
          data: monthlySorted.map(item => item.sunny_rate ?? computeTourismScore(item).sunnyRate),
          symbolSize: 8,
          lineStyle: { width: 3, color: '#facc15' },
          itemStyle: { color: '#facc15' },
          areaStyle: {
            opacity: 0.18,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(250,204,21,.30)' },
              { offset: 1, color: 'rgba(250,204,21,0)' },
            ]),
          },
          markLine: {
            symbol: 'none',
            lineStyle: { color: 'rgba(248,250,252,.25)', type: 'dashed' },
            data: [{ xAxis: MONTHS[selectedIndex] }],
          },
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, monthlySorted, selectedIndex]);

  if (!data) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-white/6 backdrop-blur-2xl p-6 shadow-[0_24px_80px_rgba(0,0,0,.30)]">
        <div className="text-slate-300">正在加载气候数据…</div>
      </section>
    );
  }

  const climateTone = data.yearly.avg_temp >= 22
    ? '偏热'
    : data.yearly.avg_temp >= 12
      ? '四季分明'
      : '偏冷';
  const humidityTone = data.yearly.avg_humidity >= 75
    ? '空气更湿润'
    : data.yearly.avg_humidity >= 60
      ? '湿度中等'
      : '整体偏干燥';
  const precipTone = data.yearly.total_precip >= 1200
    ? '降水偏丰沛'
    : data.yearly.total_precip >= 700
      ? '降水适中'
      : '降水偏少';

  const climateSummary = `${data.metadata.city} 年平均气温约 ${data.yearly.avg_temp.toFixed(1)}°C，属于${climateTone}气候；${precipTone}，${humidityTone}。最热月份通常出现在 ${MONTHS[hottest]}，最冷月份在 ${MONTHS[coldest]}；降水峰值一般在 ${MONTHS[wettest]}，最干燥月份多见于 ${MONTHS[driest]}。全年平均云量约 ${data.yearly.avg_cloud.toFixed(1)}%，遮蔽云量约 ${data.yearly.avg_opaque_cloud?.toFixed(1) ?? '—'}%，平均能见度约 ${data.yearly.avg_visibility?.toFixed(1) ?? '—'} km。`;
  const visitSummary = `综合温度、湿度和保守晴天率来看，${bestTourismMonths} 更适合到访。全年约有 ${humidMonths} 个月平均湿度在 75% 以上，最佳旅游月得分约 ${bestTourismScore.toFixed(1)}，全年平均旅游分约 ${tourismAvg.toFixed(1)}。`;
  const selectedSummary = selected
    ? `${MONTHS[selectedIndex]} 的均温约 ${selected.temp_avg.toFixed(1)}°C，最高 ${selected.temp_max.toFixed(1)}°C，最低 ${selected.temp_min.toFixed(1)}°C；月降水 ${selected.precip.toFixed(1)} mm，湿度 ${selected.humidity.toFixed(1)}%，云量 ${selected.cloud.toFixed(1)}%，晴天率（保守估算） ${(selected.sunny_rate ?? computeTourismScore(selected).sunnyRate).toFixed(1)}%，旅游评分 ${(selected.tourism_score ?? computeTourismScore(selected).score).toFixed(1)}。`
    : '—';

  const metrics = [
    { icon: Thermometer, label: '平均气温', value: `${data.yearly.avg_temp.toFixed(1)}°C`, color: 'text-sky-300' },
    { icon: Droplets, label: '年降水量', value: `${data.yearly.total_precip.toFixed(0)} mm`, color: 'text-cyan-300' },
    { icon: Cloud, label: '平均湿度', value: `${data.yearly.avg_humidity.toFixed(1)}%`, color: 'text-emerald-300' },
    { icon: Cloud, label: '平均云量', value: `${data.yearly.avg_cloud.toFixed(1)}%`, color: 'text-amber-300' },
    { icon: Sun, label: '晴天率', value: `${monthlySorted.length ? (monthlySorted.reduce((sum, item) => sum + (item.sunny_rate ?? computeTourismScore(item).sunnyRate), 0) / monthlySorted.length).toFixed(1) : '—'}%`, color: 'text-sky-300' },
    { icon: Wind, label: '平均风速', value: `${data.yearly.avg_wind.toFixed(2)} m/s`, color: 'text-violet-300' },
    { icon: Sun, label: '太阳辐射', value: `${data.yearly.total_solar.toFixed(0)} kWh/m²`, color: 'text-amber-300' },
    { icon: Waves, label: '水温', value: `${data.yearly.water_temp.toFixed(1)}°C`, color: 'text-blue-300' },
    { icon: Sprout, label: '生长季', value: `${data.yearly.growing_season.toFixed(0)} 天`, color: 'text-lime-300' },
    { icon: Calendar, label: '最佳访问', value: data.yearly.best_time, color: 'text-emerald-200' },
    { icon: ArrowUpRight, label: '旅游评分', value: data.yearly.tourism_score_avg != null ? `${data.yearly.tourism_score_avg.toFixed(1)} / 10` : '—', color: 'text-pink-300' },
  ];

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/6 backdrop-blur-2xl p-6 shadow-[0_24px_80px_rgba(0,0,0,.30)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Annual climate analysis</div>
          <h2 className="mt-1 text-3xl font-black text-white">{data.metadata.city}</h2>
          <p className="mt-2 text-sm text-slate-300/90">
            {data.metadata.state} · WMO {data.metadata.wmo}
            {data.metadata.lat != null && data.metadata.lon != null ? ` · ${data.metadata.lat.toFixed(2)}°, ${data.metadata.lon.toFixed(2)}°` : ''}
            {data.metadata.elev != null ? ` · 海拔 ${data.metadata.elev.toFixed(0)} m` : ''}
          </p>
        </div>
        {onClose ? (
          <button onClick={onClose} className="rounded-full border border-white/10 bg-white/6 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        ) : null}
      </div>

      <div className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-5 text-sm leading-7 text-slate-300/90">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">WeatherSpark style summary</div>
        <p className="mt-2">{climateSummary}</p>
        <p className="mt-2">{visitSummary}</p>
        <p className="mt-2">{selectedSummary}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
          <div key={metric.label} className="rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner shadow-black/10">
            <div className="flex items-center gap-3 text-slate-300/80">
              <metric.icon size={16} className={metric.color} />
              <span className="text-[11px] uppercase tracking-[0.22em]">{metric.label}</span>
            </div>
            <div className="mt-3 text-lg font-bold text-white">{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Temperature curve</div>
              <h3 className="mt-1 text-lg font-bold text-white">月均高低温</h3>
            </div>
            <div className="text-xs text-slate-400">高亮：{MONTHS[selectedIndex]}</div>
          </div>
          <div ref={tempChartRef} className="h-[320px] w-full" />
        </section>

        <section className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Precipitation & humidity</div>
              <h3 className="mt-1 text-lg font-bold text-white">降水、湿度与风速</h3>
            </div>
            <div className="text-xs text-slate-400">年景节律</div>
          </div>
          <div ref={climateChartRef} className="h-[320px] w-full" />
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <section className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Travel score</div>
              <h3 className="mt-1 text-lg font-bold text-white">旅游舒适指数</h3>
            </div>
            <div className="rounded-full border border-pink-300/20 bg-pink-300/10 px-3 py-1 text-xs text-pink-200">
              结合温度 / 湿度 / 晴天率
            </div>
          </div>
          <div ref={tourismChartRef} className="h-[280px] w-full" />
          <div className="mt-3 text-xs leading-6 text-slate-400">
            旅游评分由舒适温度、可接受湿度和更高晴天率共同决定；晴天率为保守估算，不等同于 100% - 云量。
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Cloudiness & sunshine</div>
              <h3 className="mt-1 text-lg font-bold text-white">云量与保守晴天率</h3>
            </div>
            <div className="text-xs text-slate-400">更适合旅游的月份通常保守晴天率更高</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">最晴朗月份</div>
              <div className="mt-2 text-xl font-bold text-white">{MONTHS[clearest]}</div>
              <div className="mt-1 text-sm text-slate-300">总云量约 {monthlySorted[clearest].cloud.toFixed(1)}%，遮蔽云量约 {(monthlySorted[clearest].opaque_cloud ?? monthlySorted[clearest].cloud).toFixed(1)}%</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">最阴云月份</div>
              <div className="mt-2 text-xl font-bold text-white">{MONTHS[cloudiest]}</div>
              <div className="mt-1 text-sm text-slate-300">总云量约 {monthlySorted[cloudiest].cloud.toFixed(1)}%，遮蔽云量约 {(monthlySorted[cloudiest].opaque_cloud ?? monthlySorted[cloudiest].cloud).toFixed(1)}%</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">全年平均云量</div>
              <div className="mt-2 text-xl font-bold text-white">{data.yearly.avg_cloud.toFixed(1)}%</div>
              <div className="mt-1 text-sm text-slate-300">对应晴天率约 {monthlySorted.length ? (monthlySorted.reduce((sum, item) => sum + (item.sunny_rate ?? computeTourismScore(item).sunnyRate), 0) / monthlySorted.length).toFixed(1) : '—'}%（保守估算）</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">最佳旅游月</div>
              <div className="mt-2 text-xl font-bold text-white">{MONTHS[bestTourismMonth]}</div>
              <div className="mt-1 text-sm text-slate-300">评分 {monthlySorted[bestTourismMonth].tourism_score.toFixed(1)} / 10</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">平均遮蔽云量</div>
              <div className="mt-2 text-xl font-bold text-white">{data.yearly.avg_opaque_cloud?.toFixed(1) ?? '—'}%</div>
              <div className="mt-1 text-sm text-slate-300">更接近能见度和体感晴朗程度</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">平均能见度</div>
              <div className="mt-2 text-xl font-bold text-white">{data.yearly.avg_visibility?.toFixed(1) ?? '—'} km</div>
              <div className="mt-1 text-sm text-slate-300">能见度高通常更有利于旅游与观景</div>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Sunshine curve</div>
            <h3 className="mt-1 text-lg font-bold text-white">12 个月晴天率曲线</h3>
          </div>
          <div className="text-xs text-slate-400">保守估算口径，便于比较月度旅游窗口</div>
        </div>
        <div ref={sunshineChartRef} className="h-[260px] w-full" />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <section className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Monthly spotlight</div>
              <h3 className="mt-1 text-lg font-bold text-white">{MONTHS[selectedIndex]} 细节</h3>
            </div>
            <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
              当前月份
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selected ? [
              ['均温', `${selected.temp_avg.toFixed(1)}°C`],
              ['最高温', `${selected.temp_max.toFixed(1)}°C`],
              ['最低温', `${selected.temp_min.toFixed(1)}°C`],
              ['降水', `${selected.precip.toFixed(1)} mm`],
              ['湿度', `${selected.humidity.toFixed(1)}%`],
              ['云量', `${selected.cloud.toFixed(1)}%`],
              ['晴天率(估)', `${(selected.sunny_rate ?? computeTourismScore(selected).sunnyRate).toFixed(1)}%`],
              ['旅游评分', `${(selected.tourism_score ?? computeTourismScore(selected).score).toFixed(1)} / 10`],
              ['风速', `${selected.wind.toFixed(1)} m/s`],
              ['舒适度', selected.comfort_label || '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{k}</div>
                <div className="mt-2 text-xl font-bold text-white">{v}</div>
              </div>
            )) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Location & visit window</div>
              <h3 className="mt-1 text-lg font-bold text-white">位置与访问建议</h3>
            </div>
            <MapPin size={18} className="text-cyan-300" />
          </div>
          <div className="space-y-3 text-sm leading-7 text-slate-300/90">
            <div>· 最热月份：<span className="font-semibold text-white">{MONTHS[hottest]}</span></div>
            <div>· 最冷月份：<span className="font-semibold text-white">{MONTHS[coldest]}</span></div>
            <div>· 降水最多：<span className="font-semibold text-white">{MONTHS[wettest]}</span></div>
            <div>· 降水最少：<span className="font-semibold text-white">{MONTHS[driest]}</span></div>
            <div>· 最晴朗月份：<span className="font-semibold text-white">{MONTHS[clearest]}</span></div>
            <div>· 最佳旅游月：<span className="font-semibold text-white">{MONTHS[bestTourismMonth]}</span></div>
            <div>· 经验结论：<span className="font-semibold text-white">{data.yearly.best_time}</span></div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-300/90">
            {data.yearly.overview}
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <ArrowUpRight size={14} />
              <span>这是静态气候摘要，适合做页面首屏结论。</span>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-5 overflow-hidden rounded-[24px] border border-white/10 bg-black/20">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Monthly table</div>
          <div className="mt-1 text-lg font-bold text-white">全年月度概览</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">月份</th>
                <th className="px-4 py-3 font-medium">均温</th>
                <th className="px-4 py-3 font-medium">最高</th>
                <th className="px-4 py-3 font-medium">最低</th>
                <th className="px-4 py-3 font-medium">降水</th>
                <th className="px-4 py-3 font-medium">湿度</th>
                <th className="px-4 py-3 font-medium">云量</th>
                <th className="px-4 py-3 font-medium">晴天率(估)</th>
                <th className="px-4 py-3 font-medium">旅游评分</th>
                <th className="px-4 py-3 font-medium">舒适度</th>
                <th className="px-4 py-3 font-medium">风速</th>
                <th className="px-4 py-3 font-medium">太阳辐射</th>
              </tr>
            </thead>
            <tbody>
              {monthlySorted.map((item, idx) => (
                <tr key={item.month} className={idx === selectedIndex ? 'bg-cyan-400/10' : 'border-t border-white/5'}>
                  <td className="px-4 py-3 text-white">{MONTHS[idx]}</td>
                  <td className="px-4 py-3">{item.temp_avg.toFixed(1)}°C</td>
                  <td className="px-4 py-3">{item.temp_max.toFixed(1)}°C</td>
                  <td className="px-4 py-3">{item.temp_min.toFixed(1)}°C</td>
                  <td className="px-4 py-3">{item.precip.toFixed(1)} mm</td>
                  <td className="px-4 py-3">{item.humidity.toFixed(1)}%</td>
                  <td className="px-4 py-3">{item.cloud.toFixed(1)}%</td>
                  <td className="px-4 py-3">{(item.sunny_rate ?? computeTourismScore(item).sunnyRate).toFixed(1)}%</td>
                  <td className="px-4 py-3">{(item.tourism_score ?? computeTourismScore(item).score).toFixed(1)}</td>
                  <td className="px-4 py-3">{item.comfort_label || '—'}</td>
                  <td className="px-4 py-3">{item.wind.toFixed(1)} m/s</td>
                  <td className="px-4 py-3">{item.solar.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default ClimateDashboard;
