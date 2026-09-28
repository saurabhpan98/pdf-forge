// src/components/AIWorkingCard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Languages, Coffee, Download, Loader2, Clock, X } from 'lucide-react';

export default function AIWorkingCard({
  task = 'summarize',
  device = null,
  progress = null,
  phaseInfo = null,
  charCount = 0,
  onCancel = null,
}) {
  const isSummarize = task === 'summarize';
  const isDownloading = progress && progress.phase === 'download';

  const messages = useMemo(() => {
    if (isDownloading) {
      return [
        'Fetching the AI model for the first time…',
        'This one-time download makes future runs instant.',
        'Almost ready — thanks for your patience.',
      ];
    }
    if (isSummarize) {
      return [
        'Reading through every section carefully…',
        'Connecting the key ideas…',
        'Keeping the important details…',
        'Drafting a clean, readable summary…',
        'Polishing the final wording…',
      ];
    }
    return [
      'Reading and understanding the source text…',
      'Preserving meaning across languages…',
      'Translating paragraph by paragraph…',
      'Keeping the tone and structure intact…',
      'Finalizing the output…',
    ];
  }, [isDownloading, isSummarize]);

  const [msgIndex, setMsgIndex] = useState(0);
  useEffect(() => {
    setMsgIndex(0);
    const id = window.setInterval(() => {
      setMsgIndex((i) => (i + 1) % messages.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [messages]);

  const percent = progress?.progress ? Math.round(progress.progress * 100) : 0;

  const estimateLabel = useMemo(() => {
    if (isDownloading || !charCount) return null;
    const isGpu = device === 'webgpu';
    const cps = isSummarize ? (isGpu ? 2000 : 200) : (isGpu ? 800 : 100);
    const seconds = Math.max(15, Math.round(charCount / cps));
    if (seconds < 60) return 'less than a minute';
    const minutes = Math.round(seconds / 60);
    if (minutes <= 1) return 'about a minute';
    if (minutes <= 4) return `${minutes}–${minutes + 1} minutes`;
    return `${minutes}–${minutes + 3} minutes`;
  }, [isDownloading, charCount, device, isSummarize]);

  const headline = isDownloading
    ? 'Getting things ready…'
    : isSummarize ? 'Working on your summary' : 'Working on your translation';

  const ThemeIcon = isSummarize ? Sparkles : Languages;
  const themeGradient = isSummarize ? 'from-rose-500 to-pink-500' : 'from-indigo-500 to-violet-500';
  const themeRing = isSummarize ? 'bg-rose-300/60' : 'bg-indigo-300/60';
  const themeRingSoft = isSummarize ? 'bg-rose-200/50' : 'bg-indigo-200/50';

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 shadow-sm pf-anim-fade-up">
      <div className={`pf-blob w-56 h-56 ${isSummarize ? 'bg-rose-200/50' : 'bg-indigo-200/50'} -top-24 -right-16 opacity-60`} aria-hidden />
      <div className={`pf-blob w-48 h-48 ${isSummarize ? 'bg-pink-200/40' : 'bg-violet-200/40'} -bottom-24 -left-16 opacity-50`} aria-hidden />

      <div className="relative px-5 sm:px-7 py-6 sm:py-7 space-y-5">
        {/* Header: icon + headline */}
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
            <div className={`absolute inset-0 rounded-full ${themeRingSoft} blur-md`} />
            <div className="absolute inset-0 pf-anim-orbit">
              <span className={`absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${themeRing} shadow`} />
            </div>
            <div className="absolute inset-0 pf-anim-orbit-slow" style={{ animationDelay: '-2.3s' }}>
              <span className={`absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${themeRing} shadow`} />
            </div>
            <div className="absolute inset-2 pf-anim-orbit" style={{ animationDelay: '-1.1s', animationDuration: '5.5s' }}>
              <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${themeRing}`} />
            </div>
            <div className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br ${themeGradient} flex items-center justify-center shadow-lg pf-anim-breathe`}>
              {isDownloading ? <Download className="w-5 h-5 text-white" /> : <ThemeIcon className="w-5 h-5 text-white" />}
            </div>
            <span className={`absolute left-1 w-1.5 h-1.5 rounded-full ${themeRing} pf-anim-bubble`} style={{ animationDelay: '0s' }} />
            <span className={`absolute left-4 w-1 h-1 rounded-full ${themeRing} pf-anim-bubble`} style={{ animationDelay: '1.2s' }} />
            <span className={`absolute right-1 w-1 h-1 rounded-full ${themeRing} pf-anim-bubble`} style={{ animationDelay: '2.1s' }} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
              {headline}
            </h3>
            <div className="mt-1 h-5 relative overflow-hidden">
              <p key={msgIndex} className="absolute inset-0 text-[11.5px] sm:text-xs text-slate-500 leading-5 pf-anim-msg">
                {messages[msgIndex]}
              </p>
            </div>
          </div>
        </div>

        {/* Sit-back pill */}
        <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border ${
          isSummarize
            ? 'bg-rose-50/70 border-rose-100 text-rose-900'
            : 'bg-indigo-50/70 border-indigo-100 text-indigo-900'
        }`}>
          <Coffee className={`w-4 h-4 shrink-0 ${isSummarize ? 'text-rose-500' : 'text-indigo-500'}`} />
          <p className="text-[11.5px] sm:text-xs font-medium leading-snug">
            <span className="font-bold">Sit back and relax —</span>{' '}
            {isSummarize
              ? 'the AI is analyzing your document deeply. Larger files take longer to do well.'
              : 'the AI is translating section by section. Longer documents take more time to get right.'}
          </p>
        </div>

        {/* Progress + cancel */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className={`w-3.5 h-3.5 animate-spin ${isSummarize ? 'text-rose-500' : 'text-indigo-500'}`} />
              <span className={`truncate ${isSummarize ? 'text-rose-900' : 'text-indigo-900'}`}>
                {isDownloading ? 'Downloading AI model…' : (phaseInfo?.message || (isSummarize ? 'Summarizing…' : 'Translating…'))}
              </span>
            </div>
            <span className={`font-mono tabular-nums shrink-0 ${isSummarize ? 'text-rose-900' : 'text-indigo-900'}`}>
              {percent}%
            </span>
          </div>

          <div className={`relative w-full rounded-full h-2 overflow-hidden ${isSummarize ? 'bg-rose-100' : 'bg-indigo-100'}`}>
            <div
              className={`relative h-full rounded-full bg-gradient-to-r ${themeGradient} transition-all duration-300`}
              style={{ width: `${Math.max(percent, 3)}%` }}
            >
              <div className="absolute inset-0 pf-progress-shimmer rounded-full" />
            </div>
          </div>

          {(phaseInfo?.chunkTotal > 1 || estimateLabel) && (
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium pt-0.5">
              <span>
                {phaseInfo?.chunkTotal > 1
                  ? `Section ${phaseInfo.chunkIndex || 1} of ${phaseInfo.chunkTotal}`
                  : (isDownloading ? 'One-time download' : 'Analyzing')}
              </span>
              {!isDownloading && estimateLabel && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>About {estimateLabel}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Cancel button */}
        {onCancel && (
          <div className="pt-1 flex justify-center">
            <button
              onClick={onCancel}
              className="group inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5 transition-transform group-hover:rotate-90" />
              <span>Stop {isSummarize ? 'summarizing' : 'translating'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}