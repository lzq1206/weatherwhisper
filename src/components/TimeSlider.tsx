import React from 'react';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

interface Props {
  currentMonth: number;
  onChange: (month: number) => void;
}

const TimeSlider: React.FC<Props> = ({ currentMonth, onChange }) => {
  const month = Math.min(Math.max(currentMonth, 1), 12);

  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-[0_18px_60px_rgba(0,0,0,.25)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Temporal analysis</div>
          <div className="mt-1 text-lg font-bold text-white">月份切换</div>
        </div>
        <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
          {MONTHS[month - 1]} 2026
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-4">
        {MONTHS.map((m, i) => {
          const value = i + 1;
          const active = value === month;
          return (
            <button
              key={m}
              onClick={() => onChange(value)}
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200 ${
                active
                  ? 'border-cyan-300/40 bg-cyan-400/15 text-white shadow-[0_0_14px_rgba(34,211,238,.18)]'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              {m}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <input
          type="range"
          min="1"
          max="12"
          step="1"
          value={month}
          onChange={e => onChange(parseInt(e.target.value, 10))}
          className="w-full cursor-pointer accent-cyan-400"
          aria-label="选择月份"
        />
      </div>

      <div className="mt-3 flex items-center justify-between px-1 text-[10px] font-medium tracking-[0.18em] text-slate-500">
        {MONTHS.map(m => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
};

export default TimeSlider;
