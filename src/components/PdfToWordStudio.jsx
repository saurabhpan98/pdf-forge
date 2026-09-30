import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, Info,
  FileText, RefreshCw, X as CloseIcon, Sparkles,
  CheckCircle2, AlertTriangle, Clock, Shield, Server,
  FileCheck, Timer, Layers, ShieldCheck, Type as TypeIcon,
  Image as ImageIcon, Table2, Columns, Palette, BarChart3,
  FileWarning, BookOpen, ListChecks,
} from 'lucide-react';
import { convertPdfToWord, checkPdfPassword, analyzePdfForWord } from '../utils/pdfWorker';

// ---------------------------------------------------------------------------
// Animated info button
// ---------------------------------------------------------------------------
function AnimatedInfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="pf-anim-pulse-ring relative w-6 h-6 ml-1 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-500/30 transition-all cursor-pointer active:scale-95 shrink-0"
      title="How does PDF to Word work?"
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
function PdfToWordInfoModal({ onClose }) {
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
    { icon: Layers, title: 'Real layout analysis',
      desc: 'Powered by pdf2docx — a computer-vision engine that detects paragraphs, headings, tables, and columns from the PDF\'s geometry, not just its text runs.' },
    { icon: Table2, title: 'Tables and images',
      desc: 'Tables are reconstructed cell-by-cell with borders. Images are extracted at native resolution and positioned where they appeared.' },
    { icon: TypeIcon, title: 'Fonts and styling',
      desc: 'Bold, italic, color, and font size are preserved. The font family is mapped to the closest installed equivalent — custom fonts may substitute on your machine.' },
    { icon: Columns, title: 'Multi-column layouts',
      desc: 'Two-column newsletters and academic papers are detected and preserved. Single-column documents pass through unchanged.' },
    { icon: AlertTriangle, title: 'Scanned PDFs need OCR',
      desc: 'If the PDF is a scan (no text layer), run it through the OCR PDF tool first. This tool converts text — it does not read pixels.' },
    { icon: Shield, title: 'Ephemeral processing',
      desc: 'Files are handled in server memory and deleted the moment your download finishes. No disk writes, no database, no logs.' },
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
              <h3 className="text-sm font-black text-slate-900">How PDF to Word works</h3>
              <p className="text-[11px] text-slate-500">Layout analysis, not text dumping</p>
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
            Converting a PDF to Word is not a format flip — it is a reverse-engineering
            problem. PDFs describe where each character sits on the page, not what it
            belongs to. The converter has to infer paragraphs, tables, headings, and
            columns from position alone.
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
                Documents created digitally (Word, LaTeX, InDesign) convert with
                excellent fidelity. Scanned forms and complex scientific papers
                may need manual cleanup. For scanned PDFs, run OCR first.
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
function ConversionProgress({ elapsed }) {
  const messages = [
    'Reading page structure…',
    'Detecting paragraphs and columns…',
    'Reconstructing tables…',
    'Extracting images…',
    'Building the DOCX…',
  ];
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMsgIdx((i) => (i + 1) % messages.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [messages.length]);

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
            <Layers className="w-5 h-5 text-white" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-slate-900 tracking-tight">
            Analyzing your PDF
          </h3>
          <div className="h-5 mt-1 relative overflow-hidden">
            <p key={msgIdx} className="absolute inset-0 text-[11.5px] text-slate-500 leading-5 pf-anim-msg">
              {messages[msgIdx]}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Elapsed</p>
          <p className="text-lg font-black text-slate-900 tabular-nums">{elapsed}s</p>
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
        Sit back and relax — layout analysis takes a moment longer than a plain text dump.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function PdfToWordStudio({ tool, file, onBack }) {
  const [activeFile, setActiveFile] = useState(file);
  const newFileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);

  const [fileHealth, setFileHealth] = useState({ valid: false, size: 0, pageCount: 0, hasText: null });
  const [analysis, setAnalysis] = useState(null);          // complexity report
  const [analysisFailed, setAnalysisFailed] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);

  // ---- Analyze on file load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadFailed(false);
      setErrorMsg('');
      setResult(null);
      setAnalysis(null);
      setAnalysisFailed(false);

      try {
        if (!activeFile) { setLoadFailed(true); setLoading(false); return; }
        const size = activeFile.size;

        let isLocked = false;
        try { isLocked = await checkPdfPassword(activeFile); }
        catch { /* treat as unlocked */ }

        if (isLocked) {
          if (!cancelled) {
            setErrorMsg(`"${activeFile.name}" is password-protected. Please unlock it first.`);
            setLoadFailed(true);
            setLoading(false);
          }
          return;
        }

        // Quick page count via pdf.js for the file card
        let pageCount = 0;
        let hasText = null;
        try {
          const { getDocument } = await import('pdfjs-dist');
          const buf = await activeFile.arrayBuffer();
          const doc = await getDocument({ data: buf }).promise;
          pageCount = doc.numPages;
          try {
            const firstPage = await doc.getPage(1);
            const tc = await firstPage.getTextContent();
            hasText = tc.items.some((it) => it.str && it.str.trim().length > 0);
          } catch { hasText = null; }
          try { doc.destroy(); } catch { /* ignore */ }
        } catch { /* ignore */ }

        if (!cancelled) setFileHealth({ valid: true, size, pageCount, hasText });

        // Run the complexity analyzer
        try {
          const report = await analyzePdfForWord(activeFile);
          if (!cancelled) setAnalysis(report);
        } catch (err) {
          console.warn('PDF analysis failed:', err);
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

  useEffect(() => {
    if (!isProcessing) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isProcessing]);

  // ---- Derive badge from analysis ----
  const accuracyBadge = useMemo(() => {
    if (!analysis || !analysis.accuracyTier || analysis.accuracyTier === 'unknown') return null;

    const tier = analysis.accuracyTier;
    if (tier === 'high') {
      return {
        label: 'High accuracy',
        tone: 'emerald',
        icon: CheckCircle2,
        message: 'This PDF is well-suited to conversion. Text, tables, and images will be preserved with high fidelity.',
      };
    }
    if (tier === 'good') {
      return {
        label: 'Good accuracy',
        tone: 'blue',
        icon: Sparkles,
        message: 'Solid conversion expected. Some minor alignment shifts are possible but the overall structure will be preserved.',
      };
    }
    if (tier === 'approximate') {
      return {
        label: 'Approximate',
        tone: 'amber',
        icon: BarChart3,
        message: 'Complex layout detected. The output will be structurally correct but may need minor cleanup — check tables and columns in Word.',
      };
    }
    return {
      label: 'Limited fidelity',
      tone: 'rose',
      icon: AlertTriangle,
      message: 'This PDF will not convert cleanly without preparation. See the details below before converting.',
    };
  }, [analysis]);

  const handleConvert = async () => {
    setIsProcessing(true);
    setErrorMsg('');
    setResult(null);
    try {
      const output = await convertPdfToWord(activeFile);
      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        originalSize: output.originalSize,
        compressedSize: output.compressedSize,
        engine: output.engine,
        enhanced: output.enhanced,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err.message || 'Conversion failed.');
    } finally {
      setIsProcessing(false);
    }
  };

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

  const engineLabel = useMemo(() => {
    if (!result?.engine) return null;
    return {
      pdf2docx: 'pdf2docx layout engine',
      legacy: 'Fallback engine',
    }[result.engine] || result.engine;
  }, [result]);

  // =========================================================================
  // RESULT SCREEN
  // =========================================================================
  if (result) {
    const usedLegacy = result.engine === 'legacy';

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
              <h2 className="text-sm font-bold text-slate-900">PDF to Word — Done</h2>
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
              <h3 className="text-xl font-black text-slate-900">Word document ready</h3>
              <p className="text-xs text-slate-500">
                Converted with <strong className="text-slate-700">{engineLabel}</strong>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Pages
                </p>
                <p className="text-xl font-black text-slate-900 tabular-nums mt-0.5">
                  {fileHealth.pageCount || '—'}
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

            {!usedLegacy && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] text-emerald-900 text-left leading-relaxed">
                <strong>Layout analysis applied:</strong> paragraphs, headings, tables,
                and images were reconstructed from the PDF's geometry, not just its
                text layer.
              </div>
            )}

            {usedLegacy && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 text-left leading-relaxed">
                <strong>Fallback engine used:</strong> the primary layout analyzer could
                not process this PDF. The fallback preserves text and tables but may
                produce lower fidelity for complex layouts.
              </div>
            )}

            {result.enhanced && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl text-[11px] text-blue-900 text-left leading-relaxed">
                <strong>Post-processing applied:</strong> schema normalization ensures
                the file opens cleanly in Word without errors.
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
                <Download className="w-4 h-4" /><span>Download DOCX</span>
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
  const isScanned = fileHealth.hasText === false || (analysis && !analysis.hasTextLayer);

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <input
        type="file"
        ref={newFileInputRef}
        accept="application/pdf"
        className="hidden"
        onChange={handleNewFile}
      />

      {showInfoModal && <PdfToWordInfoModal onClose={() => setShowInfoModal(false)} />}

      <header className="sticky top-0 shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-[1100px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
          <button
            onClick={handleBack}
            className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="sm:inline">Back to Home</span>
          </button>

          <div className="flex items-center space-x-2 min-w-0 flex-1 justify-center">
            <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center shrink-0`}>
              {tool && <tool.icon className="w-4 h-4" />}
            </div>
            <div className="sm:block min-w-0">
              <h2 className="text-sm font-bold text-slate-900 leading-none">PDF to Word</h2>
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
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden xs:inline">Converting…</span></>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /><span className="sm:inline">Convert PDF</span></>
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

        {isProcessing ? (
          <ConversionProgress elapsed={elapsed} />
        ) : (
          <>
            {/* Document card with inline badge + summary strip */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Source PDF
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate min-w-0">
                      {activeFile?.name}
                    </p>
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
                  <span>Change</span>
                </button>
              </div>

              {/* Accuracy summary strip */}
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
                      {accuracyBadge.message}
                    </p>
                    {analysis?.reasons?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {analysis.reasons.map((r, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[10.5px] text-slate-600 leading-snug">
                            <span className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${
                              accuracyBadge.tone === 'emerald' ? 'bg-emerald-500'
                              : accuracyBadge.tone === 'blue' ? 'bg-blue-500'
                              : accuracyBadge.tone === 'amber' ? 'bg-amber-500'
                              : 'bg-rose-500'
                            }`} />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-4">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                    Pages
                  </p>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">
                    {loading ? '—' : (fileHealth.pageCount || '—')}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                    File size
                  </p>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">
                    {formatFileSize(fileHealth.size)}
                  </p>
                </div>
              </div>
            </div>

            {/* Analysis failed fallback */}
            {!loading && analysisFailed && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5 pf-anim-fade-up">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="flex-1 font-medium">
                  Could not pre-analyze this PDF. Conversion will proceed normally —
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
                <div className="p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[11px] font-black text-emerald-900">Layout analysis</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Paragraphs, headings, tables, and columns are detected from the
                    PDF's geometry — not just dumped as text.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-blue-100 bg-blue-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Table2 className="w-3.5 h-3.5 text-blue-600" />
                    <p className="text-[11px] font-black text-blue-900">Tables &amp; images</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Tables become real Word tables with borders. Images are extracted
                    at native resolution and positioned inline.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-amber-100 bg-amber-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <TypeIcon className="w-3.5 h-3.5 text-amber-600" />
                    <p className="text-[11px] font-black text-amber-900">Fonts</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Bold, italic, color, and size are preserved. Custom font families
                    map to the closest available on your machine.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                    <p className="text-[11px] font-black text-slate-800">Privacy</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Files are processed in server memory only. No disk, no database,
                    no logs.
                  </p>
                </div>
              </div>
            </div>

            {/* Action card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-slate-900">
                    {isScanned ? 'Convert anyway?' : 'Ready to convert'}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {isScanned
                      ? 'This looks like a scanned PDF. The conversion may produce an empty document without OCR.'
                      : 'Layout analysis takes a few seconds. You will get an editable .docx file with preserved tables, images, and structure.'}
                  </p>
                </div>
                <button
                  onClick={handleConvert}
                  disabled={loading || loadFailed}
                  className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Convert to DOCX</span>
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