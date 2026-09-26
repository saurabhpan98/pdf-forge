import React from 'react';

export default function ToolCard({ tool, onSelect, delayIndex = 0 }) {
  const IconComponent = tool.icon;
  const isInactive = tool.inactive;
  const delay = (delayIndex % 8) + 1;

  return (
    <button
      onClick={() => !isInactive && onSelect(tool)}
      disabled={isInactive}
      className={`pf-card pf-anim-fade-up pf-delay-${delay} group relative text-left bg-white p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between overflow-hidden ${
        isInactive
          ? 'opacity-60 cursor-not-allowed border-slate-200'
          : 'border-slate-200/80 hover:border-rose-200 shadow-sm hover:shadow-lg hover:shadow-rose-100/60 cursor-pointer'
      }`}
    >
      {/* Corner glow on hover */}
      {!isInactive && (
        <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br from-rose-100 to-indigo-100 opacity-0 group-hover:opacity-60 blur-3xl transition-opacity duration-500" />
      )}

      {/* Badge */}
      {tool.badge && (
        <span
          className={`relative z-10 self-end mb-2 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
            tool.badge === 'Coming Soon'
              ? 'bg-slate-100 text-slate-600 border border-slate-200'
              : tool.badge === '90% Accurate'
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}
        >
          {tool.badge}
        </span>
      )}

      <div className="relative z-10">
        <div
          className={`w-11 h-11 rounded-xl ${tool.bg} ${tool.color} flex items-center justify-center mb-4 transition-all duration-300 ${
            !isInactive
              ? 'group-hover:scale-110 group-hover:rotate-[4deg] shadow-sm group-hover:shadow-md'
              : ''
          }`}
        >
          <IconComponent className="w-5 h-5" />
        </div>

        <h3
          className={`font-bold text-[13px] leading-snug tracking-tight transition-colors ${
            !isInactive
              ? 'text-slate-900 group-hover:text-rose-600'
              : 'text-slate-500'
          }`}
        >
          {tool.name}
        </h3>

        <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed line-clamp-2">
          {tool.desc}
        </p>
      </div>

      {/* Arrow reveal */}
      {!isInactive && (
        <div className="relative z-10 mt-4 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-300 group-hover:text-rose-400 transition-colors">
            Open
          </span>
          <div className="w-6 h-6 rounded-full bg-slate-100 group-hover:bg-rose-500 flex items-center justify-center transition-all duration-300 group-hover:translate-x-0.5">
            <svg
              viewBox="0 0 24 24"
              className="w-3 h-3 text-slate-400 group-hover:text-white transition-colors"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      )}
    </button>
  );
}