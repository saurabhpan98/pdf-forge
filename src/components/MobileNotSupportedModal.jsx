import React, { useEffect } from 'react';
import { Monitor, Smartphone, X as CloseIcon } from 'lucide-react';

export default function MobileNotSupportedModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 pf-anim-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pf-anim-scale-in relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 p-7"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          aria-label="Close"
        >
          <CloseIcon className="w-4 h-4" />
        </button>

        {/* Illustration */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100 flex items-center justify-center relative shadow-sm">
            <Smartphone className="w-6 h-6 text-rose-400" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-0.5 bg-rose-500 rotate-45 rounded-full" />
            </div>
          </div>

          <svg
            className="w-6 h-6 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>

          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-md">
            <Monitor className="w-6 h-6 text-white" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-base font-black text-slate-900 tracking-tight">
            Open on a larger screen
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Edit PDF Text needs precise mouse input and a bigger canvas. Switch to a{' '}
            <span className="font-bold text-slate-800">PC or laptop</span> to use this tool.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-bold transition cursor-pointer active:scale-[0.98]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}