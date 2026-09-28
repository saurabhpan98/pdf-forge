// src/components/AICacheManager.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  X, HardDrive, Trash2, Loader2, Check, AlertTriangle, RefreshCw,
} from 'lucide-react';
import {
  getAICacheStats,
  clearAICache,
  formatBytes,
  getOriginStorageEstimate,
} from '../utils/aiCacheManager';

export default function AICacheManager({ onClose, onCleared }) {
  const [stats, setStats] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [justCleared, setJustCleared] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([
        getAICacheStats(),
        getOriginStorageEstimate(),
      ]);
      setStats(s);
      setOrigin(o);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleClear = async () => {
    setClearing(true);
    try {
      const result = await clearAICache();
      setJustCleared(result);
      await refresh();
      onCleared?.(result);
      // Auto-dismiss the "cleared" banner after 3s
      window.setTimeout(() => setJustCleared(null), 3000);
    } finally {
      setClearing(false);
      setConfirming(false);
    }
  };

  const hasCache = (stats?.bytes || 0) > 0;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 pf-anim-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pf-anim-slide-up sm:pf-anim-scale-in bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">AI Model Storage</h3>
              <p className="text-[11px] text-slate-500">Locally cached on this device</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-xs font-semibold">Scanning local cache…</p>
            </div>
          ) : (
            <>
              {/* Primary stat */}
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-white border border-indigo-100 p-5 text-center">
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600 mb-1">
                  AI models cached
                </p>
                <p className="text-3xl font-black text-slate-900 tracking-tight">
                  {formatBytes(stats?.bytes || 0)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {stats?.entryCount || 0} files across {stats?.cacheCount || 0} cache
                  {(stats?.cacheCount || 0) === 1 ? '' : 's'}
                </p>
              </div>

              {/* Origin storage bar */}
              {origin && origin.quota > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span>Device storage used by this site</span>
                    <span className="tabular-nums">
                      {formatBytes(origin.usage)} / {formatBytes(origin.quota)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (origin.usage / origin.quota) * 100).toFixed(1)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Per-cache breakdown */}
              {hasCache && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Breakdown
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {stats.caches.map((c) => (
                      <div
                        key={c.name}
                        className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px]"
                      >
                        <span className="font-mono text-slate-700 truncate max-w-[60%]">
                          {c.name}
                        </span>
                        <span className="font-bold text-slate-900 tabular-nums">
                          {formatBytes(c.bytes)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Success banner */}
              {justCleared && (
                <div className="pf-anim-slide-down p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start space-x-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Cleared successfully</p>
                    <p className="mt-0.5 text-emerald-800">
                      Freed {formatBytes(justCleared.freedBytes)} across {justCleared.deletedCaches} cache
                      {justCleared.deletedCaches === 1 ? '' : 's'}. Models will re-download next time you use an AI tool.
                    </p>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!hasCache && !justCleared && (
                <div className="text-center py-6 space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
                    <HardDrive className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">No AI models cached</p>
                  <p className="text-[11px] text-slate-500 max-w-[260px] mx-auto leading-relaxed">
                    Models download automatically the first time you use AI Summarizer or Translate PDF.
                  </p>
                </div>
              )}

              {/* Explanation */}
              {hasCache && (
                <div className="p-3 bg-sky-50 border border-sky-100 rounded-2xl text-[11px] text-sky-900 leading-relaxed">
                  <strong className="font-bold">Why cache exists:</strong> AI models are large
                  (100–600 MB). Caching them means you only download once per device. Clearing
                  the cache frees disk space but the next run will re-download.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            onClick={refresh}
            disabled={loading || clearing}
            className="sm:flex-1 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={!hasCache || clearing}
              className="sm:flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear cache</span>
            </button>
          ) : (
            <div className="sm:flex-1 flex items-center gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={clearing}
                className="flex-1 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                <span>{clearing ? 'Clearing…' : 'Confirm'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}