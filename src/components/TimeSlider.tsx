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
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[600px] z-10 bg-black/60 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
      <div className="flex justify-between mb-4">
        <span className="text-blue-400 font-bold uppercase tracking-widest text-xs">Temporal Analysis</span>
        <span className="text-white font-mono text-xs">{MONTHS[currentMonth - 1]} 2026</span>
      </div>
      
      <input
        type="range"
        min="1"
        max="12"
        step="1"
        value={currentMonth}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
      />
      
      <div className="flex justify-between mt-3 px-1">
        {MONTHS.map((m, i) => (
          <span
            key={m}
            className={`text-[10px] font-medium transition-colors ${
              i + 1 === currentMonth ? 'text-white' : 'text-gray-500'
            }`}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
};

export default TimeSlider;
