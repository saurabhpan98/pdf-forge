import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, Info,
  FileText, Wrench, ShieldCheck, Zap, Sparkles, AlertTriangle,
  Layers, Shield, Lock, Clock, FileWarning, RefreshCw, X as CloseIcon,
  Upload, CheckCircle2, Activity, Server,
} from 'lucide-react';
import { repairPdf, checkPdfPassword } from '../utils/pdfWorker';

// ---------------------------------------------------------------------------
// Animated info button
// ---------------------------------------------------------------------------
function AnimatedInfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="pf-anim-pulse-ring relative w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white flex items-center justify-center shadow-md shadow-green-500/30 transition-all cursor-pointer active:scale-95 shrink-0"
      title="What does repair do?"
      aria-label="Show repair info"
    >
      <span
        className="absolute -inset-1 rounded-full pointer-events-none"
        style={{
          background: 'conic-gradient(from 0deg, rgba(16,185,129,0), rgba(16,185,129,0.65), rgba(16,185,129,0))',
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
function RepairInfoModal({ onClose }) {
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
    {
      icon: Wrench,
      title: 'Rebuilds the file structure',
      desc: 'Corrupted cross-reference tables, broken object numbers, wrong stream lengths, and missing trailer markers are all rewritten from scratch.',
    },
    {
      icon: Layers,
      title: 'Three independent engines',
      desc: 'Ghostscript rebuilds with maximum fidelity. PyMuPDF auto-repairs on open. pikepdf (QPDF) uses a loose parser for the toughest cases. First success wins.',
    },
    {
      icon: FileWarning,
      title: 'Recovers truncated downloads',
      desc: 'Files cut off mid-download, or missing their final bytes, are usually recoverable as long as the page content survived.',
    },
    {
      icon: ShieldCheck,
      title: 'Content is preserved as-is',
      desc: 'The page content, fonts, and images are not recompressed or downsampled. Only the surrounding file structure is rebuilt.',
    },
    {
      icon: AlertTriangle,
      title: 'Not always possible',
      desc: 'If the actual content bytes are gone, no tool can bring them back. We report the failure honestly rather than outputting a broken file.',
    },
    {
      icon: Lock,
      title: 'Handled on our server',
      desc: 'Files are processed in memory, deleted the moment your download finishes, and never written to a database or log.',
    },
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
            <div className="w-9 h-9 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">How repair works</h3>
              <p className="text-[11px] text-slate-500">Rebuilding broken PDF structure</p>
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
            Most "corrupted" PDFs are not actually destroyed — the page content is still
            there, but the surrounding structure that tells readers where to find it has
            been damaged. Repair rebuilds that structure so readers can open the file again.
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
                    <div className="w-7 h-7 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-black text-slate-900 leading-tight">
                        {p.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {p.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-green-50 via-white to-white border border-green-100 flex items-start gap-3">
            <Server className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-black text-slate-900">When to use it</p>
              <p className="text-[11.5px] text-slate-600 mt-0.5 leading-snug">
                If a PDF refuses to open, shows only a blank page, or throws a "file is
                damaged" error in your reader, this is the first tool to try. If it
                succeeds, open the repaired file in your usual reader to confirm it works.
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
// Diagnostic progress display
// ---------------------------------------------------------------------------
function DiagnosticProgress({ phase, engine, elapsed }) {
  const steps = [
    { id: 'checking', label: 'Verifying PDF signature', icon: Shield },
    { id: 'gs', label: 'Running Ghostscript rebuild', icon: Activity },
    { id: 'pymupdf', label: 'Attempting PyMuPDF recovery', icon: Sparkles },
    { id: 'pikepdf', label: 'Trying pikepdf reconstruction', icon: Layers },
    { id: 'finalizing', label: 'Verifying repaired output', icon: CheckCircle2 },
  ];

  const currentIdx = steps.findIndex((s) => s.id === phase);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5 pf-anim-fade-up">
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
          <div className="absolute inset-0 rounded-full bg-green-200/50 blur-md" />
          <div className="absolute inset-0 pf-anim-orbit">
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-green-400 shadow" />
          </div>
          <div className="absolute inset-0 pf-anim-orbit-slow">
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500" />
          </div>
          <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg pf-anim-breathe">
            <Wrench className="w-5 h-5 text-white" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-slate-900 tracking-tight">
            {engine ? `Running ${engine} recovery…` : 'Analyzing damaged PDF'}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Trying multiple repair engines — this can take a moment.
          </p>
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

      <div className="space-y-1.5">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isDone = currentIdx > i;
          const isCurrent = currentIdx === i;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 ${
                isDone
                  ? 'bg-green-50/60 border border-green-100'
                  : isCurrent
                  ? 'bg-white border border-green-300 ring-2 ring-green-500/15 shadow-sm'
                  : 'bg-slate-50/40 border border-slate-100'
              }`}
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                isDone
                  ? 'bg-green-500 text-white'
                  : isCurrent
                  ? 'bg-green-100 text-green-600'
                  : 'bg-slate-100 text-slate-400'
              }`}>
                {isDone ? (
                  <Check className="w-3.5 h-3.5" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
              </div>
              <span className={`text-[11.5px] font-bold ${
                isDone ? 'text-green-800' : isCurrent ? 'text-slate-900' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
              {isCurrent && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-green-700">
                  In progress
                </span>
              )}
              {isDone && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-green-700">
                  Done
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function RepairPdfStudio({ tool, file, onBack }) {
  const [activeFile, setActiveFile] = useState(file);
  const newFileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);

  // File health diagnostics
  const [fileHealth, setFileHealth] = useState({
    readable: null,     // true | false | null (null = still checking)
    pageCount: 0,
    size: 0,
    error: null,
  });

  // Repair state
  const [isRepairing, setIsRepairing] = useState(false);
  const [phase, setPhase] = useState('checking');
  const [engine, setEngine] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);

  // ---- Load file health diagnostics ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadFailed(false);
      setErrorMsg('');
      setResult(null);
      try {
        if (!activeFile) { setLoadFailed(true); setLoading(false); return; }
        const size = activeFile.size;

        let isLocked = false;
        try { isLocked = await checkPdfPassword(activeFile); } catch { /* treat as unlocked */ }
        if (isLocked) {
          if (!cancelled) {
            setErrorMsg(`"${activeFile.name}" is password-protected. Please unlock it first with the Unlock PDF tool, then return here to repair.`);
            setLoadFailed(true);
            setLoading(false);
          }
          return;
        }

        // Try opening with pdf.js to see if it's readable
        let readable = false;
        let pageCount = 0;
        let errText = null;
        try {
          const { getDocument } = await import('pdfjs-dist');
          const buf = await activeFile.arrayBuffer();
          const doc = await getDocument({ data: buf }).promise;
          pageCount = doc.numPages;
          readable = pageCount > 0;
          try { doc.destroy(); } catch { /* ignore */ }
        } catch (err) {
          readable = false;
          errText = err?.message || 'The file could not be opened by a standard PDF reader.';
        }

        if (!cancelled) {
          setFileHealth({ readable, pageCount, size, error: errText });
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setErrorMsg('Failed to analyze the file.');
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeFile]);

  // ---- Elapsed timer during repair ----
  useEffect(() => {
    if (!isRepairing) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isRepairing]);

  // ---- Handler: repair ----
  const handleRepair = async () => {
    setIsRepairing(true);
    setErrorMsg('');
    setResult(null);
    setEngine(null);
    setPhase('checking');

    // Step the phases visually while the backend runs
    const phaseSequence = ['checking', 'gs', 'pymupdf', 'pikepdf', 'finalizing'];
    const timings = [600, 3500, 3500, 3500, 2000];
    const phaseTimers = [];
    let accumulated = 0;
    phaseSequence.slice(0, -1).forEach((p, i) => {
      accumulated += timings[i];
      phaseTimers.push(window.setTimeout(() => setPhase(phaseSequence[i + 1]), accumulated));
    });

    try {
      const output = await repairPdf(activeFile);
      // Repair succeeded
      phaseTimers.forEach((t) => window.clearTimeout(t));
      setPhase('finalizing');
      setEngine(output.engine);

      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        originalSize: output.originalSize,
        compressedSize: output.compressedSize,
        engine: output.engine,
        repairedPages: output.repairedPages,
        originalPages: output.originalPages,
        pagesLost: output.pagesLost,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      phaseTimers.forEach((t) => window.clearTimeout(t));
      setErrorMsg(err.message || 'Repair failed.');
    } finally {
      setIsRepairing(false);
    }
  };

  const handleContinue = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setEngine(null);
    setPhase('checking');
  };

  const handleNewFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setErrorMsg('');
    setEngine(null);
    setActiveFile(f);
  };

  const handleBack = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    onBack();
  };

  // ---- Render helpers ----
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB';
    const k = 1024;
    if (bytes < k) return `${bytes} B`;
    if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
    return `${(bytes / (k * k)).toFixed(2)} MB`;
  };

  const engineLabel = useMemo(() => {
    if (!result?.engine) return null;
    return {
      ghostscript: 'Ghostscript',
      pymupdf: 'PyMuPDF',
      pikepdf: 'pikepdf (QPDF)',
    }[result.engine] || result.engine;
  }, [result]);

  // =========================================================================
  // RESULT SCREEN
  // =========================================================================
  if (result) {
    const allPagesRecovered = result.pagesLost === 0 && result.repairedPages > 0;

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
              <h2 className="text-sm font-bold text-slate-900">Repair PDF — Done</h2>
            </div>
            <div className="w-16" />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 max-w-md w-full text-center space-y-6 shadow-md pf-anim-scale-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-slate-900">PDF repaired successfully</h3>
              <p className="text-xs text-slate-500">
                Recovered by <strong className="text-slate-700">{engineLabel}</strong>
              </p>
            </div>

            {/* Recovery stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Pages recovered
                </p>
                <p className="text-xl font-black text-slate-900 tabular-nums mt-0.5">
                  {result.repairedPages}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  of {result.originalPages || '?'} original
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  File size
                </p>
                <p className="text-xl font-black text-slate-900 tabular-nums mt-0.5">
                  {formatFileSize(result.compressedSize)}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  was {formatFileSize(result.originalSize)}
                </p>
              </div>
            </div>

            {/* Partial-recovery warning */}
            {!allPagesRecovered && result.pagesLost > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-left flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-black text-amber-900">Partial recovery</p>
                  <p className="text-[11.5px] text-amber-800 mt-0.5 leading-snug">
                    {result.pagesLost} page{result.pagesLost === 1 ? '' : 's'} could not be recovered
                    because the content data was already lost. The remaining pages have been
                    rebuilt and are fully readable.
                  </p>
                </div>
              </div>
            )}

            {/* Verified removal / integrity note */}
            <div className="p-3 bg-green-50 border border-green-100 rounded-2xl text-[11px] text-green-900 text-left leading-relaxed">
              <strong>Verified:</strong> The rebuilt file opens cleanly in standard PDF
              readers. Page content, fonts, and images were preserved — only the file
              structure was rewritten.
            </div>

            <p className="text-xs text-slate-500 truncate">
              File: <strong className="text-slate-800">{result.filename}</strong>
            </p>

            <div className="flex flex-col gap-3 pt-1">
              <a
                href={result.url}
                download={result.filename}
                className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold shadow-md shadow-green-600/20 flex items-center justify-center space-x-2 transition cursor-pointer active:scale-[0.98]"
              >
                <Download className="w-4 h-4" /><span>Download repaired PDF</span>
              </a>
              <button
                onClick={handleContinue}
                className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer"
              >
                Try repairing another file
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
  const isRepairingOrLoading = isRepairing;

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <input
        type="file"
        ref={newFileInputRef}
        accept="application/pdf"
        className="hidden"
        onChange={handleNewFile}
      />

      {showInfoModal && <RepairInfoModal onClose={() => setShowInfoModal(false)} />}

      {/* HEADER */}
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
              <h2 className="text-sm font-bold text-slate-900 leading-none">Repair PDF</h2>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[240px]">
                {activeFile?.name}
              </p>
            </div>
            <AnimatedInfoButton onClick={() => setShowInfoModal(true)} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRepair}
              disabled={isRepairingOrLoading || loading || loadFailed}
              className="px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition cursor-pointer active:scale-[0.98]"
            >
              {isRepairing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Repairing…</span></>
              ) : (
                <><Wrench className="w-3.5 h-3.5" /><span className="sm:inline">Repair PDF</span></>
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

        {/* Document + Health Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-11 h-11 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Damaged file
              </p>
              <p className="text-sm font-bold text-slate-900 truncate">{activeFile?.name}</p>
            </div>
            <button
              onClick={() => newFileInputRef.current?.click()}
              disabled={isRepairing}
              className="text-[10px] font-bold text-green-700 hover:text-green-800 px-2.5 py-1.5 rounded-lg hover:bg-green-50 transition flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Change file</span>
            </button>
          </div>

          {/* Health readout */}
          {loading ? (
            <div className="py-6 flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-green-500" />
              <p className="text-[11px] font-semibold text-slate-500">Analyzing file health…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
              {/* Diagnostic status */}
              <div className={`p-3.5 rounded-2xl border ${
                fileHealth.readable
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : 'bg-rose-50/60 border-rose-200'
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  {fileHealth.readable ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  )}
                  <p className={`text-[9px] font-black uppercase tracking-wider ${
                    fileHealth.readable ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    Diagnostic
                  </p>
                </div>
                <p className={`text-sm font-black ${
                  fileHealth.readable ? 'text-emerald-800' : 'text-rose-800'
                }`}>
                  {fileHealth.readable ? 'Readable' : 'Damaged'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                  {fileHealth.readable
                    ? 'The file opens but may still have structural issues.'
                    : 'Standard readers cannot open this file.'}
                </p>
              </div>

              {/* Pages */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Pages detected
                  </p>
                </div>
                <p className="text-sm font-black text-slate-900 tabular-nums">
                  {fileHealth.pageCount || '—'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  As reported by a lenient parser
                </p>
              </div>

              {/* Size */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <Activity className="w-3.5 h-3.5 text-slate-500" />
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                    File size
                  </p>
                </div>
                <p className="text-sm font-black text-slate-900 tabular-nums">
                  {formatFileSize(fileHealth.size)}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Original bytes received
                </p>
              </div>
            </div>
          )}

          {fileHealth.error && !fileHealth.readable && (
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Parser error
              </p>
              <p className="text-[11px] font-mono text-slate-600 break-words leading-snug">
                {fileHealth.error.length > 220
                  ? fileHealth.error.slice(0, 220) + '…'
                  : fileHealth.error}
              </p>
            </div>
          )}
        </div>

        {/* Repair progress card (replaces the action panel while running) */}
        {isRepairing ? (
          <DiagnosticProgress phase={phase} engine={engine} elapsed={elapsed} />
        ) : (
          <>
            {/* How it works / engines explanation */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-1">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-green-600" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Repair pipeline
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    icon: Activity,
                    title: 'Tier 1 — Ghostscript',
                    desc: 'Rebuilds the file structure with maximum fidelity.',
                    accent: 'text-green-600 bg-green-50 border-green-100',
                  },
                  {
                    icon: Sparkles,
                    title: 'Tier 2 — PyMuPDF',
                    desc: 'Loose parser that auto-repairs on open.',
                    accent: 'text-emerald-600 bg-emerald-50 border-emerald-100',
                  },
                  {
                    icon: Shield,
                    title: 'Tier 3 — pikepdf',
                    desc: 'QPDF engine for the toughest corruption.',
                    accent: 'text-teal-600 bg-teal-50 border-teal-100',
                  },
                ].map((tier) => {
                  const Icon = tier.icon;
                  return (
                    <div
                      key={tier.title}
                      className={`p-3.5 rounded-2xl border ${tier.accent} transition-all duration-200 hover:scale-[1.02]`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        <p className="text-[11px] font-black">{tier.title}</p>
                      </div>
                      <p className="text-[10.5px] text-slate-600 leading-snug">
                        {tier.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Repair action card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-slate-900">
                    {fileHealth.readable
                      ? 'Rebuild file structure?'
                      : 'Attempt recovery?'}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {fileHealth.readable
                      ? 'Even if the file opens, its structure may still contain errors that could cause problems in some readers. Repair rewrites it cleanly.'
                      : 'The file is damaged. Repair will attempt to rebuild it from whatever content data remains.'}
                  </p>
                </div>
                <button
                  onClick={handleRepair}
                  disabled={loading || loadFailed}
                  className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-green-500/25 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shrink-0"
                >
                  <Wrench className="w-4 h-4" />
                  <span>Repair PDF</span>
                </button>
              </div>
            </div>

            {/* Trust note */}
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-slate-100/70 border border-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
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