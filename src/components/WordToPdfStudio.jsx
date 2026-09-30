import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, Info,
  FileText, RefreshCw, X as CloseIcon, Upload, Sparkles,
  CheckCircle2, AlertTriangle, Clock, Shield, Zap, Server,
  FileWarning, Type as TypeIcon, FileCode, Timer, Layers,
  ShieldCheck, FileCheck, Palette, BarChart3, Box, Boxes,
  Eye, EyeOff, SwitchCamera,
} from 'lucide-react';
import {
  convertWordToPDF,
  checkDocxPassword,
  analyzeDocx,
} from '../utils/pdfWorker';

// ---------------------------------------------------------------------------
// Animated info button
// ---------------------------------------------------------------------------
function AnimatedInfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="pf-anim-pulse-ring relative w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-500/30 transition-all cursor-pointer active:scale-95 shrink-0"
      title="How does Word to PDF work?"
      aria-label="Show conversion info"
    >
      <span
        className="absolute -inset-1 rounded-full pointer-events-none"
        style={{
          background: 'conic-gradient(from 0deg, rgba(59,130,246,0), rgba(59,130,246,0.65), rgba(59,130,246,0))',
          animation: 'pf-anim-orbit 4s linear infinite',
          maskImage: 'radial-gradient(circle, transparent 60%, black 61%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 60%, black 61%)',
        }}
        aria-hidden
      />
      <span className="absolute inset-0 pointer-events-none pf-anim-orbit-slow">
        <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white shadow" />
      </span>
      <Info className="relative w-4 h-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Info modal
// ---------------------------------------------------------------------------
function WordToPdfInfoModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const points = [
    { icon: Server, title: 'Real conversion engine',
      desc: 'Uses LibreOffice headless — the same open-source office engine that powers many commercial converters. Not a text-dump shortcut.' },
    { icon: TypeIcon, title: 'Fonts are the key',
      desc: 'Every font in your document must be available on our servers. Missing fonts are substituted with a metric-compatible clone.' },
    { icon: BarChart3, title: 'Charts and diagrams',
      desc: 'Native Word charts, SmartArt, and embedded objects render with reduced fidelity. This is a hard limitation of LibreOffice, not a bug.' },
    { icon: FileCheck, title: 'Structure preserved',
      desc: 'Headings, lists, tables, and images retain their formatting. Output is a tagged PDF, preserving document structure for accessibility.' },
    { icon: Clock, title: '3–15 seconds typical',
      desc: 'Conversion time scales with document size. Larger documents with many images or charts take longer.' },
    { icon: Shield, title: 'Ephemeral processing',
      desc: 'Files are handled entirely in server memory, never written to disk or a database, and removed the moment your download finishes.' },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 pf-anim-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pf-anim-slide-up sm:pf-anim-scale-in bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">How Word to PDF works</h3>
              <p className="text-[11px] text-slate-500">Real LibreOffice conversion, explained</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
            aria-label="Close"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto">
          <p className="text-[12.5px] text-slate-600 leading-relaxed">
            Your document is converted by LibreOffice Writer running on our server.
            The engine is the same open-source core that ships with Linux distributions.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {points.map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className={`pf-anim-fade-up pf-delay-${(i % 8) + 1} p-3 rounded-2xl border border-slate-200 bg-slate-50/60`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-black text-slate-900 leading-tight">{p.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{p.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-white border border-blue-100 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-black text-slate-900">Best results</p>
              <p className="text-[11.5px] text-slate-600 mt-0.5 leading-snug">
                For pixel-perfect conversion of a highly-customized layout with native
                charts, export directly from Word. For standard business documents
                and forms, this tool produces equivalent quality.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-bold transition cursor-pointer active:scale-[0.98]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversion progress
// ---------------------------------------------------------------------------
function ConversionProgress({ elapsed, highFidelity }) {
  const messages = useMemo(() => (
    highFidelity
      ? [
          'Reading document structure…',
          'Rendering charts and shapes…',
          'Rasterizing pages at high DPI…',
          'Reassembling PDF…',
          'Finalizing output…',
        ]
      : [
          'Reading document structure…',
          'Applying styles and formatting…',
          'Embedding fonts…',
          'Rendering tables and images…',
          'Finalizing PDF…',
        ]
  ), [highFidelity]);

  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setMsgIdx((i) => (i + 1) % messages.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [messages]);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5 pf-anim-fade-up">
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
          <div className="absolute inset-0 rounded-full bg-blue-200/50 blur-md" />
          <div className="absolute inset-0 pf-anim-orbit">
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-400 shadow" />
          </div>
          <div className="absolute inset-0 pf-anim-orbit-slow">
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500" />
          </div>
          <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg pf-anim-breathe">
            <FileText className="w-5 h-5 text-white" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-slate-900 tracking-tight">
            {highFidelity ? 'Rendering high-fidelity PDF' : 'Converting your document'}
          </h3>
          <div className="h-5 mt-1 relative overflow-hidden">
            <p
              key={msgIdx}
              className="absolute inset-0 text-[11.5px] text-slate-500 leading-5 pf-anim-msg"
            >
              {messages[msgIdx]}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Elapsed
          </p>
          <p className="text-lg font-black text-slate-900 tabular-nums">
            {elapsed}s
          </p>
        </div>
      </div>

      <div className="relative w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
        <div className="absolute inset-0 pf-progress-shimmer" />
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${Math.min(95, 10 + elapsed * 12)}%` }}
        />
      </div>

      <p className="text-[10.5px] text-slate-500 text-center">
        Sit back and relax — a fresh LibreOffice process is spinning up for your document.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function WordToPdfStudio({ tool, file, onBack }) {
  const [activeFile, setActiveFile] = useState(file);
  const newFileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);

  const [fileHealth, setFileHealth] = useState({ valid: false, size: 0, error: null });
  const [analysis, setAnalysis] = useState(null);        // { missingFonts, complexityWarnings, hasCharts, ... }
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [highFidelity, setHighFidelity] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);

  // ---- Analyze file on load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadFailed(false);
      setErrorMsg('');
      setResult(null);
      setAnalysis(null);
      setAnalysisFailed(false);
      setHighFidelity(false);

      try {
        if (!activeFile) { setLoadFailed(true); setLoading(false); return; }
        const size = activeFile.size;

        let isLocked = false;
        try { isLocked = await checkDocxPassword(activeFile); }
        catch { /* treat as unlocked */ }

        if (isLocked) {
          if (!cancelled) {
            setErrorMsg(`"${activeFile.name}" is password-protected. Please unlock it first.`);
            setLoadFailed(true);
            setLoading(false);
          }
          return;
        }

        if (!cancelled) setFileHealth({ valid: true, size, error: null });

        // Run analysis (font audit + complexity)
        try {
          const report = await analyzeDocx(activeFile);
          if (!cancelled) setAnalysis(report);
        } catch (err) {
          console.warn('Analysis failed:', err);
          if (!cancelled) setAnalysisFailed(true);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg('Failed to analyze the file.');
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeFile]);

  // ---- Elapsed timer ----
  useEffect(() => {
    if (!isProcessing) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isProcessing]);

  const handleConvert = async () => {
    setIsProcessing(true);
    setErrorMsg('');
    setResult(null);
    try {
      const output = await convertWordToPDF(activeFile, { highFidelity });
      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        originalSize: output.originalSize,
        compressedSize: output.compressedSize,
        missingFonts: output.missingFonts || [],
        usedFonts: output.usedFonts || [],
        pageCount: output.pageCount || 0,
        textExtractable: output.textExtractable,
        complexityWarnings: output.complexityWarnings || [],
        highFidelity: output.highFidelity,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err.message || 'Conversion failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const accuracyBadge = useMemo(() => {
    if (!analysis) return null;
    const { hasCharts, hasDiagrams, hasOleObjects, hasDrawingCanvas } = analysis;
    const complex = [hasCharts, hasDiagrams, hasOleObjects].filter(Boolean).length;
    if (complex === 0 && !hasDrawingCanvas) {
      return { label: 'High accuracy', tone: 'emerald', icon: CheckCircle2 };
    }
    if (hasDiagrams || hasOleObjects) {
      return { label: 'Limited fidelity', tone: 'rose', icon: AlertTriangle };
    }
    if (hasCharts) {
      return { label: 'Approximate', tone: 'amber', icon: BarChart3 };
    }
    return { label: 'Good accuracy', tone: 'blue', icon: Sparkles };
  }, [analysis]);

  const handleContinue = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  };

  const handleNewFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setErrorMsg('');
    setActiveFile(f);
  };

  const handleBack = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    onBack();
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB';
    const k = 1024;
    if (bytes < k) return `${bytes} B`;
    if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
    return `${(bytes / (k * k)).toFixed(2)} MB`;
  };

  const hasFontWarnings = (result?.missingFonts?.length || 0) > 0;
  const hasComplexityWarnings = (result?.complexityWarnings?.length || 0) > 0;
  const complexityDetected = Boolean(
    analysis?.hasCharts || analysis?.hasDiagrams ||
    analysis?.hasOleObjects || analysis?.hasDrawingCanvas
  );

  // =========================================================================
  // RESULT SCREEN
  // =========================================================================
  if (result) {
    return (
      <div className="bg-slate-50 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-sm px-3 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /><span>Back</span>
            </button>
            <div className="flex items-center space-x-2">
              <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center`}>
                <tool.icon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">Word to PDF — Done</h2>
            </div>
            <div className="w-16" />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 max-w-md w-full text-center space-y-6 shadow-md pf-anim-scale-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-slate-900">PDF ready</h3>
              <p className="text-xs text-slate-500">
                {result.pageCount} page{result.pageCount === 1 ? '' : 's'} converted
                {result.highFidelity ? ' · high-fidelity mode' : ''}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Pages
                </p>
                <p className="text-xl font-black text-slate-900 tabular-nums mt-0.5">
                  {result.pageCount}
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Size
                </p>
                <p className="text-xl font-black text-slate-900 tabular-nums mt-0.5">
                  {formatFileSize(result.compressedSize)}
                </p>
              </div>
            </div>

            {hasFontWarnings && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-black text-amber-900">
                      Some fonts were substituted
                    </p>
                    <p className="text-[11.5px] text-amber-800 mt-0.5 leading-snug">
                      Line breaks may shift slightly on these:
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {result.missingFonts.map((font) => (
                    <span
                      key={font}
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-800"
                    >
                      {font}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {hasComplexityWarnings && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-left space-y-2">
                <div className="flex items-start gap-2.5">
                  <BarChart3 className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-black text-rose-900">
                      Some elements may render differently
                    </p>
                    <ul className="mt-1 space-y-1">
                      {result.complexityWarnings.map((w, i) => (
                        <li key={i} className="text-[11px] text-rose-800 leading-snug flex items-start gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {result.textExtractable && !result.highFidelity && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] text-emerald-900 text-left leading-relaxed">
                <strong>Verified:</strong> Text is selectable in the output PDF, and all
                fonts were embedded as real glyphs.
              </div>
            )}

            {result.highFidelity && (
              <div className="p-3 bg-violet-50 border border-violet-100 rounded-2xl text-[11px] text-violet-900 text-left leading-relaxed">
                <strong>High-fidelity mode:</strong> Each page was rasterized at 200 DPI.
                The output looks exactly as LibreOffice rendered it, but text is no
                longer selectable.
              </div>
            )}

            <p className="text-xs text-slate-500 truncate">
              File: <strong className="text-slate-800">{result.filename}</strong>
            </p>

            <div className="flex flex-col gap-3 pt-1">
              <a
                href={result.url}
                download={result.filename}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 flex items-center justify-center space-x-2 transition cursor-pointer active:scale-[0.98]"
              >
                <Download className="w-4 h-4" /><span>Download PDF</span>
              </a>
              <button
                onClick={handleContinue}
                className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer"
              >
                Convert another file
              </button>
              <button
                onClick={handleBack}
                className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer"
              >
                Return to Home
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // EDITOR
  // =========================================================================
  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <input
        type="file"
        ref={newFileInputRef}
        accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
        className="hidden"
        onChange={handleNewFile}
      />

      {showInfoModal && <WordToPdfInfoModal onClose={() => setShowInfoModal(false)} />}

      <header className="sticky top-0 shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-[1100px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
          <button
            onClick={handleBack}
            className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Home</span>
          </button>

          <div className="flex items-center space-x-2 min-w-0 flex-1 justify-center">
            <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center shrink-0`}>
              {tool && <tool.icon className="w-4 h-4" />}
            </div>
            <div className="sm:block min-w-0">
              <h2 className="text-sm font-bold text-slate-900 leading-none">Word to PDF</h2>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[240px]">
                {activeFile?.name}
              </p>
            </div>
            <AnimatedInfoButton onClick={() => setShowInfoModal(true)} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleConvert}
              disabled={isProcessing || loading || loadFailed}
              className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition cursor-pointer active:scale-[0.98]"
            >
              {isProcessing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Converting…</span></>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /><span className="sm:inline">Convert</span></>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1100px] mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        {errorMsg && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-2.5 pf-anim-slide-down">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">{errorMsg}</p>
          </div>
        )}

        {/* Document card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Source document
              </p>
              <div className="flex items-center gap-2 mt-0.5 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate min-w-0">
                  {activeFile?.name}
                </p>
                {/* Content-aware accuracy badge, inline with the filename */}
                {accuracyBadge && !loading && (
                  <span
                    className={`pf-anim-slide-down inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${
                      accuracyBadge.tone === 'emerald'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : accuracyBadge.tone === 'blue'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : accuracyBadge.tone === 'amber'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                    title="Predicted conversion accuracy for this file"
                  >
                    <accuracyBadge.icon className="w-2.5 h-2.5" />
                    <span>{accuracyBadge.label}</span>
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => newFileInputRef.current?.click()}
              disabled={isProcessing}
              className="text-[10px] font-bold text-blue-700 hover:text-blue-800 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Change file</span>
            </button>
          </div>

          {/* Accuracy summary strip — appears once analysis completes */}
          {accuracyBadge && !loading && (
            <div
              className={`pf-anim-fade-up mt-4 p-3 rounded-2xl border flex items-start gap-2.5 ${
                accuracyBadge.tone === 'emerald'
                  ? 'bg-emerald-50/60 border-emerald-100'
                  : accuracyBadge.tone === 'blue'
                  ? 'bg-blue-50/60 border-blue-100'
                  : accuracyBadge.tone === 'amber'
                  ? 'bg-amber-50/60 border-amber-100'
                  : 'bg-rose-50/60 border-rose-100'
              }`}
            >
              <accuracyBadge.icon
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  accuracyBadge.tone === 'emerald'
                    ? 'text-emerald-600'
                    : accuracyBadge.tone === 'blue'
                    ? 'text-blue-600'
                    : accuracyBadge.tone === 'amber'
                    ? 'text-amber-600'
                    : 'text-rose-600'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-black ${
                  accuracyBadge.tone === 'emerald'
                    ? 'text-emerald-900'
                    : accuracyBadge.tone === 'blue'
                    ? 'text-blue-900'
                    : accuracyBadge.tone === 'amber'
                    ? 'text-amber-900'
                    : 'text-rose-900'
                }`}>
                  {accuracyBadge.label}
                </p>
                <p className="text-[10.5px] text-slate-600 mt-0.5 leading-snug">
                  {accuracyBadge.tone === 'emerald' && 'This document will convert with high fidelity — text, tables, and images are preserved exactly.'}
                  {accuracyBadge.tone === 'blue' && 'Minor shape positioning may shift slightly, but overall layout is preserved.'}
                  {accuracyBadge.tone === 'amber' && 'Charts will render, but custom colors, gradients, and embedded data tables may differ from Word.'}
                  {accuracyBadge.tone === 'rose' && 'SmartArt or embedded objects use a fallback representation. Consider enabling High-fidelity mode below.'}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-4">
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                File size
              </p>
              <p className="text-sm font-bold text-slate-800 tabular-nums">
                {formatFileSize(fileHealth.size)}
              </p>
            </div>
            <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl">
              <p className="text-[9px] font-black uppercase tracking-wider text-blue-600 mb-0.5">
                Est. time
              </p>
              <p className="text-sm font-bold text-blue-700">
                {fileHealth.size < 500 * 1024
                  ? '3–5 seconds'
                  : fileHealth.size < 5 * 1024 * 1024
                  ? '5–10 seconds'
                  : '10–20 seconds'}
              </p>
            </div>
          </div>
        </div>

        {isProcessing ? (
          <ConversionProgress elapsed={elapsed} highFidelity={highFidelity} />
        ) : (
          <>
            {/* Complexity warning card — shown only when detected */}
            {!loading && complexityDetected && (
              <div className="bg-white border border-rose-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-slate-900">
                      Complex elements detected
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      This document contains content LibreOffice renders with reduced
                      fidelity. Here's what we found:
                    </p>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {analysis?.hasCharts && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800">
                      <BarChart3 className="w-3 h-3" />
                      {analysis.chartCount} chart{analysis.chartCount === 1 ? '' : 's'}
                    </span>
                  )}
                  {analysis?.hasDiagrams && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800">
                      <Boxes className="w-3 h-3" />
                      {analysis.diagramCount} SmartArt
                    </span>
                  )}
                  {analysis?.hasOleObjects && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800">
                      <Box className="w-3 h-3" />
                      {analysis.oleCount} embedded
                    </span>
                  )}
                  {analysis?.hasDrawingCanvas && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800">
                      <Layers className="w-3 h-3" />
                      Canvas
                    </span>
                  )}
                </div>

                {/* Warnings list */}
                {analysis?.complexityWarnings?.length > 0 && (
                  <ul className="space-y-1.5 pl-1">
                    {analysis.complexityWarnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-slate-600 leading-snug">
                        <span className="w-1 h-1 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* High-fidelity toggle */}
                <div className="pt-3 border-t border-slate-100">
                  <label className={`flex items-start gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                    highFidelity
                      ? 'border-violet-400 bg-violet-50/60 ring-2 ring-violet-500/15'
                      : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={highFidelity}
                      onChange={(e) => setHighFidelity(e.target.checked)}
                      disabled={isProcessing}
                      className="mt-0.5 w-4 h-4 rounded accent-violet-600 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Eye className={`w-3.5 h-3.5 ${highFidelity ? 'text-violet-600' : 'text-slate-500'}`} />
                        <span className={`text-[12px] font-black ${highFidelity ? 'text-violet-900' : 'text-slate-800'}`}>
                          High-fidelity mode
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-200">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                        Rasterizes each page at 200 DPI after LibreOffice renders it.
                        The PDF will look exactly as LibreOffice produced it — no
                        further fidelity loss. Trade-off: <strong>text is no longer
                        selectable</strong> in the output.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Analysis warning — shown only when analysis failed */}
            {!loading && analysisFailed && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5 pf-anim-fade-up">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="flex-1 font-medium">
                  Could not pre-analyze this document. Conversion will proceed normally —
                  any fidelity issues will only appear in the result.
                </p>
              </div>
            )}

            {/* What to expect */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-1">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-600" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  What to expect
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl border border-blue-100 bg-blue-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <p className="text-[11px] font-black text-blue-900">Timing</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    3–15 seconds typically. Larger documents with tables and
                    images take longer.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-amber-100 bg-amber-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <TypeIcon className="w-3.5 h-3.5 text-amber-600" />
                    <p className="text-[11px] font-black text-amber-900">Fonts</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Custom or corporate fonts may be substituted. Line breaks
                    can shift slightly on complex layouts.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[11px] font-black text-emerald-900">Quality</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Headings, lists, tables, and images retain their formatting.
                    Output is a tagged PDF.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                    <p className="text-[11px] font-black text-slate-800">Privacy</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Files are processed in server memory only. No disk, no
                    database, no logs.
                  </p>
                </div>
              </div>
            </div>

            {/* Action card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-slate-900">
                    Ready to convert
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {highFidelity
                      ? 'High-fidelity mode is on. Output will look exactly as LibreOffice rendered it.'
                      : 'Your document will be converted by LibreOffice on our server.'}
                  </p>
                </div>
                <button
                  onClick={handleConvert}
                  disabled={loading || loadFailed}
                  className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shrink-0"
                >
                  {highFidelity ? <Eye className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  <span>{highFidelity ? 'Convert in HD' : 'Convert to PDF'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-slate-100/70 border border-slate-200">
              <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-600 leading-snug">
                Your file is processed in memory on our server and deleted the moment
                your download finishes. It is never written to disk or stored in a
                database.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}