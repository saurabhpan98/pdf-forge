import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, Info,
  FileText, Minimize2, Layers, Zap, Gauge, Sparkles, Image as ImageIcon,
  RefreshCw, Settings, SlidersHorizontal, TrendingDown, X as CloseIcon,
  Upload, Shield, Lock, Eye, Palette, Scan, Archive, Clock, HardDrive,
  CheckCircle2, AlertTriangle, Sparkle,
} from 'lucide-react';
import { compressPDF, checkPdfPassword } from '../utils/pdfWorker';

// ---------------------------------------------------------------------------
// Compression level definitions
// ---------------------------------------------------------------------------
const LEVELS = [
  {
    id: 'light', label: 'Light', tagline: 'Preserve quality',
    condense: { dpi: 150, quality: 90 },
    photon:   { dpi: 150, quality: 85 },
    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200',
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'balanced', label: 'Balanced', tagline: 'Recommended',
    condense: { dpi: 96, quality: 75 },
    photon:   { dpi: 120, quality: 70 },
    color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200',
    chip: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    id: 'aggressive', label: 'Aggressive', tagline: 'For email / web',
    condense: { dpi: 72, quality: 50 },
    photon:   { dpi: 96, quality: 50 },
    color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200',
    chip: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    id: 'extreme', label: 'Extreme', tagline: 'Smallest size',
    condense: { dpi: 60, quality: 30 },
    photon:   { dpi: 72, quality: 30 },
    color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200',
    chip: 'bg-rose-100 text-rose-800 border-rose-200',
  },
];

const ALGORITHMS = [
  {
    id: 'condense',
    name: 'Smart Compress',
    icon: Layers,
    tagline: 'Text stays selectable',
    description:
      'Removes dead weight, recompresses images, subsets fonts, and strips metadata. Links and text remain fully functional.',
    accent: 'text-cyan-600',
    bg: 'bg-cyan-50',
    ring: 'ring-cyan-500',
    border: 'border-cyan-500',
  },
  {
    id: 'photon',
    name: 'Deep Compress',
    icon: ImageIcon,
    tagline: 'Smallest possible size',
    description:
      'Rasterizes each page to a high-quality JPEG at the target DPI. Ideal for scanned or photo-heavy documents. Text becomes non-selectable.',
    accent: 'text-violet-600',
    bg: 'bg-violet-50',
    ring: 'ring-violet-500',
    border: 'border-violet-500',
  },
];

function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
  return `${(bytes / (k * k)).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// Animated info button
// ---------------------------------------------------------------------------
function AnimatedInfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="pf-anim-pulse-ring relative w-6 h-6 ml-1 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white flex items-center justify-center shadow-md shadow-emerald-500/30 transition-all cursor-pointer active:scale-95 shrink-0"
      title="What is PDF compression?"
      aria-label="Show compression info"
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
function CompressInfoModal({ onClose }) {
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
    { icon: Layers, title: 'Two engines, one goal',
      desc: 'Smart Compress shrinks text-heavy documents while keeping text selectable. Deep Compress rasterizes pages for photo-heavy scans — smaller output, but text stops being selectable.' },
    { icon: ImageIcon, title: 'Images are the biggest win',
      desc: 'A single high-resolution photo can be 50 MB. Recompressing images at a sensible DPI usually saves 40–80% of total file size.' },
    { icon: Gauge, title: 'DPI controls fidelity',
      desc: 'Target DPI decides how much detail survives. 150 DPI looks near-identical on screen. 72 DPI is fine for email attachments. 60 DPI is for the smallest possible file.' },
    { icon: Sparkles, title: 'JPEG quality affects size',
      desc: 'Below ~60, artifacts become visible around text and sharp edges. Above 85, size grows sharply for little visual gain.' },
    { icon: Palette, title: 'Grayscale drops colors',
      desc: 'Converting to grayscale can cut file size by another 20–40% on color-heavy documents. Best for text-only or scanned material.' },
    { icon: Shield, title: 'Never larger',
      desc: 'If compression cannot beat the original size, the untouched file is returned. This tool can only make your PDF smaller, never bigger.' },
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
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Minimize2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">How compression works</h3>
              <p className="text-[11px] text-slate-500">Smaller files, same content</p>
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
            PDFs get large because of embedded images, uncompressed streams, and
            leftover metadata. Compression rewrites the file so it renders the
            same on screen while taking up much less space on disk.
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
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
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

          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-white border border-emerald-100 flex items-start gap-3">
            <Gauge className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-black text-slate-900">What to pick</p>
              <p className="text-[11.5px] text-slate-600 mt-0.5 leading-snug">
                Start with <strong className="font-bold">Smart Compress</strong> at{' '}
                <strong className="font-bold">Balanced</strong>. If the output is still too large,
                switch to <strong className="font-bold">Deep Compress</strong> at{' '}
                <strong className="font-bold">Aggressive</strong>. Only go Extreme when the size
                matters more than readability.
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
// Info card on the result screen
// ---------------------------------------------------------------------------
function ResultPanel({ result, onContinue, onBack }) {
  const {
    originalSize, compressedSize, wasCompressed, algorithm, filename,
  } = result;
  const savedBytes = Math.max(0, originalSize - compressedSize);
  const reduction = originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;
  const algoLabel = algorithm === 'photon' ? 'Deep Compress' : 'Smart Compress';

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5 pf-anim-scale-in max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${wasCompressed ? 'bg-emerald-50' : 'bg-amber-50'}`}>
          {wasCompressed
            ? <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            : <AlertTriangle className="w-6 h-6 text-amber-600" />}
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">
            {wasCompressed ? 'File compressed' : 'Already optimal'}
          </h3>
          <p className="text-[11px] text-slate-500">
            {wasCompressed
              ? `Saved ${reduction.toFixed(1)}% with ${algoLabel}`
              : 'Compression could not make it smaller — original returned unchanged'}
          </p>
        </div>
      </div>

      {wasCompressed && (
        <div className="p-4 bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-2xl">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Original</p>
              <p className="text-sm font-bold text-slate-700 mt-0.5">{formatFileSize(originalSize)}</p>
            </div>
            <div className="flex flex-col items-center justify-center">
              <TrendingDown className="w-5 h-5 text-emerald-600 mb-1" />
              <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                -{reduction.toFixed(0)}%
              </span>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Compressed</p>
              <p className="text-sm font-bold text-emerald-700 mt-0.5">{formatFileSize(compressedSize)}</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-emerald-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-semibold">Saved</span>
            <span className="font-bold text-emerald-700">{formatFileSize(savedBytes)}</span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500 truncate">
        File: <strong className="text-slate-800">{filename}</strong>
      </p>

      <div className="flex flex-col gap-2.5">
        <a
          href={result.url}
          download={filename}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
        >
          <Download className="w-4 h-4" />
          <span>Download PDF</span>
        </a>
        <button
          onClick={onContinue}
          className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-semibold transition cursor-pointer"
        >
          Try different settings
        </button>
        <button
          onClick={onBack}
          className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-semibold transition cursor-pointer"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function CompressPdfStudio({ tool, file, onBack }) {
  const [activeFile, setActiveFile] = useState(file);
  const newFileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [algorithm, setAlgorithm] = useState('condense');
  const [level, setLevel] = useState('balanced');
  const [customOpen, setCustomOpen] = useState(false);
  const [customDpi, setCustomDpi] = useState(null);
  const [customQuality, setCustomQuality] = useState(null);
  const [grayscale, setGrayscale] = useState(false);
  const [removeMetadata, setRemoveMetadata] = useState(true);
  const [subsetFonts, setSubsetFonts] = useState(true);
  const [removeThumbnails, setRemoveThumbnails] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [result, setResult] = useState(null);

  const [fileSize, setFileSize] = useState(0);
  const [pageCount, setPageCount] = useState(0);

  const currentLevel = LEVELS.find((l) => l.id === level) || LEVELS[1];

  // Effective settings (custom overrides level defaults)
  const effectiveDpi = customDpi ?? currentLevel[algorithm === 'photon' ? 'photon' : 'condense'].dpi;
  const effectiveQuality = customQuality ?? currentLevel[algorithm === 'photon' ? 'photon' : 'condense'].quality;

  // ---- Load file metadata ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadFailed(false);
      setErrorMsg('');
      setResult(null);
      try {
        if (!activeFile) { setLoadFailed(true); setLoading(false); return; }
        const isLocked = await checkPdfPassword(activeFile);
        if (isLocked) {
          if (!cancelled) {
            setErrorMsg(`"${activeFile.name}" is password-protected. Please unlock it first.`);
            setLoadFailed(true);
            setLoading(false);
          }
          return;
        }
        setFileSize(activeFile.size);

        // Quick page count via pdf-lib (already a dependency)
        try {
          const { PDFDocument } = await import('pdf-lib');
          const buf = await activeFile.arrayBuffer();
          const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
          if (!cancelled) setPageCount(doc.getPageCount());
        } catch {
          if (!cancelled) setPageCount(0);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setErrorMsg('Failed to read PDF.');
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeFile]);

  // ---- Estimated output size (rough heuristic for preview) ----
  const estimatedRatio = useMemo(() => {
    // Very rough heuristic based on quality + DPI + algorithm
    const q = effectiveQuality / 100;
    const dpiFactor = Math.min(1.5, effectiveDpi / 150);
    const base = algorithm === 'photon' ? 0.55 : 0.35;
    const ratio = base * Math.pow(q, 1.4) * Math.pow(dpiFactor, 1.2);
    const grayBonus = grayscale ? 0.75 : 1;
    return Math.max(0.05, Math.min(0.95, ratio * grayBonus));
  }, [algorithm, effectiveDpi, effectiveQuality, grayscale]);

  const estimatedSize = fileSize > 0 ? Math.round(fileSize * estimatedRatio) : 0;

  // ---- Handlers ----
  const handleCompress = async () => {
    setIsProcessing(true);
    setErrorMsg('');
    setResult(null);
    try {
      const output = await compressPDF(activeFile, {
        algorithm,
        dpi: effectiveDpi,
        quality: effectiveQuality,
        grayscale,
        removeMetadata,
        subsetFonts,
        removeThumbnails,
      });
      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        originalSize: output.originalSize,
        compressedSize: output.compressedSize,
        wasCompressed: output.wasCompressed,
        algorithm: output.algorithm,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err.message || 'Compression failed.');
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

  const resetCustom = () => {
    setCustomDpi(null);
    setCustomQuality(null);
    setGrayscale(false);
    setRemoveMetadata(true);
    setSubsetFonts(true);
    setRemoveThumbnails(true);
  };

  const isCustomActive =
    customDpi !== null || customQuality !== null || grayscale ||
    !removeMetadata || !subsetFonts || !removeThumbnails;

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
              <h2 className="text-sm font-bold text-slate-900">Compress PDF — Done</h2>
            </div>
            <div className="w-16" />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <ResultPanel
            result={result}
            onContinue={handleContinue}
            onBack={handleBack}
          />
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
        accept="application/pdf"
        className="hidden"
        onChange={handleNewFile}
      />

      {showInfoModal && <CompressInfoModal onClose={() => setShowInfoModal(false)} />}

      {/* ---- HEADER ---- */}
      <header className="sticky top-0 shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-[1200px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
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
            <div className="hidden sm:block min-w-0">
              <h2 className="text-sm font-bold text-slate-900 leading-none">Compress PDF</h2>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[240px]">
                {activeFile?.name}
              </p>
            </div>
            <AnimatedInfoButton onClick={() => setShowInfoModal(true)} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCompress}
              disabled={isProcessing || loading || loadFailed}
              className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition cursor-pointer active:scale-[0.98]"
            >
              {isProcessing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Compressing…</span></>
              ) : (
                <><Minimize2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Compress PDF</span></>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1200px] mx-auto w-full px-3 sm:px-4 py-4 sm:py-6">
        {errorMsg && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-2.5 pf-anim-slide-down">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">{errorMsg}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
          {/* ============ LEFT: SETTINGS ============ */}
          <div className="lg:col-span-8 space-y-4">

            {/* Document card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up">
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Source PDF
                  </p>
                  <p className="text-sm font-bold text-slate-800 truncate">{activeFile?.name}</p>
                </div>
                <button
                  onClick={() => newFileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Change</span>
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Pages</p>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">
                    {loading ? '—' : (pageCount || '—')}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Current size</p>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">
                    {formatFileSize(fileSize)}
                  </p>
                </div>
                <div className="p-3 bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-xl">
                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600 mb-0.5">Estimated</p>
                  <p className="text-sm font-bold text-emerald-700 tabular-nums">
                    ~{formatFileSize(estimatedSize)}
                  </p>
                </div>
              </div>
            </div>

            {/* Algorithm selector */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-1">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-slate-500" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Compression algorithm
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ALGORITHMS.map((a) => {
                  const Icon = a.icon;
                  const active = algorithm === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setAlgorithm(a.id);
                        setCustomDpi(null);
                        setCustomQuality(null);
                      }}
                      disabled={isProcessing}
                      className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer group ${
                        active
                          ? `${a.border} ${a.bg} ring-2 ring-offset-1 shadow-sm`
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      } disabled:cursor-not-allowed`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${active ? a.bg : 'bg-slate-100'} ${active ? a.accent : 'text-slate-500'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm font-black ${active ? 'text-slate-900' : 'text-slate-700'}`}>
                              {a.name}
                            </p>
                            {active && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            )}
                          </div>
                          <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${active ? a.accent : 'text-slate-400'}`}>
                            {a.tagline}
                          </p>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-3">
                        {a.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Compression level */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-slate-500" />
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                    Compression level
                  </h3>
                </div>
                {isCustomActive && (
                  <button
                    type="button"
                    onClick={resetCustom}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                  >
                    Reset custom
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {LEVELS.map((l) => {
                  const active = level === l.id && !isCustomActive;
                  const target = l[algorithm === 'photon' ? 'photon' : 'condense'];
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setLevel(l.id);
                        setCustomDpi(null);
                        setCustomQuality(null);
                      }}
                      disabled={isProcessing}
                      className={`relative p-3.5 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer ${
                        active
                          ? `${l.border} ${l.bg} ring-2 ring-offset-1 ring-emerald-300/30`
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      } disabled:cursor-not-allowed`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className={`text-xs font-black ${active ? 'text-slate-900' : 'text-slate-700'}`}>
                          {l.label}
                        </p>
                        {active && (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </div>
                      <p className={`text-[9px] font-bold uppercase tracking-wider ${active ? l.color : 'text-slate-400'} mb-2`}>
                        {l.tagline}
                      </p>
                      <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500 tabular-nums">
                        <span>{target.dpi} DPI</span>
                        <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                        <span>Q{target.quality}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom settings toggle */}
              <button
                type="button"
                onClick={() => setCustomOpen((v) => !v)}
                className="mt-4 w-full py-2.5 border border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700 rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{customOpen ? 'Hide' : 'Show'} custom settings</span>
              </button>

              {/* Custom settings panel */}
              {customOpen && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 pf-anim-slide-down">
                  {/* DPI slider */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                        <Scan className="w-3 h-3 text-slate-500" />
                        Image resolution
                      </label>
                      <span className="text-xs font-black text-emerald-700 tabular-nums bg-emerald-50 px-2 py-0.5 rounded-full">
                        {effectiveDpi} DPI
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="300"
                      step="10"
                      value={effectiveDpi}
                      onChange={(e) => setCustomDpi(parseInt(e.target.value, 10))}
                      disabled={isProcessing}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-emerald-600 disabled:opacity-50"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-1">
                      <span>50 (smallest)</span>
                      <span>150 (balanced)</span>
                      <span>300 (sharpest)</span>
                    </div>
                  </div>

                  {/* Quality slider */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                        <Sparkle className="w-3 h-3 text-slate-500" />
                        JPEG quality
                      </label>
                      <span className="text-xs font-black text-emerald-700 tabular-nums bg-emerald-50 px-2 py-0.5 rounded-full">
                        {effectiveQuality}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="95"
                      step="5"
                      value={effectiveQuality}
                      onChange={(e) => setCustomQuality(parseInt(e.target.value, 10))}
                      disabled={isProcessing}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-emerald-600 disabled:opacity-50"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-1">
                      <span>10 (artifacts)</span>
                      <span>60 (safe)</span>
                      <span>95 (best)</span>
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition ${grayscale ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={grayscale}
                        onChange={(e) => setGrayscale(e.target.checked)}
                        disabled={isProcessing}
                        className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
                      />
                      <Palette className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[11px] font-semibold text-slate-700">Convert to grayscale</span>
                    </label>

                    <label className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition ${removeMetadata ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={removeMetadata}
                        onChange={(e) => setRemoveMetadata(e.target.checked)}
                        disabled={isProcessing}
                        className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
                      />
                      <Shield className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[11px] font-semibold text-slate-700">Remove metadata</span>
                    </label>

                    <label className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition ${subsetFonts ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={subsetFonts}
                        onChange={(e) => setSubsetFonts(e.target.checked)}
                        disabled={isProcessing}
                        className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
                      />
                      <Layers className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[11px] font-semibold text-slate-700">Subset fonts</span>
                    </label>

                    <label className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition ${removeThumbnails ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={removeThumbnails}
                        onChange={(e) => setRemoveThumbnails(e.target.checked)}
                        disabled={isProcessing}
                        className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
                      />
                      <Archive className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[11px] font-semibold text-slate-700">Drop thumbnails</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ============ RIGHT: SUMMARY + ACTION ============ */}
          <div className="lg:col-span-4 space-y-4">
            {/* Live summary */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm lg:sticky lg:top-20 pf-anim-fade-up pf-delay-3">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900">Live preview</h3>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Algorithm</span>
                  <span className="font-bold text-slate-900">
                    {ALGORITHMS.find((a) => a.id === algorithm)?.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Level</span>
                  <span className={`font-bold ${isCustomActive ? 'text-amber-600' : 'text-slate-900'}`}>
                    {isCustomActive ? 'Custom' : currentLevel.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">DPI</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">{effectiveDpi}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Quality</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">{effectiveQuality}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Grayscale</span>
                  <span className={`font-bold ${grayscale ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {grayscale ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <div className="p-3 bg-slate-50 rounded-2xl">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    <span>Expected output</span>
                    <span className="text-emerald-600">~{Math.round((1 - estimatedRatio) * 100)}% smaller</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 font-medium truncate">{formatFileSize(fileSize)}</span>
                    <ArrowLeft className="w-3.5 h-3.5 text-slate-400 rotate-180" />
                    <span className="text-xs font-black text-emerald-700">~{formatFileSize(estimatedSize)}</span>
                  </div>
                  <div className="mt-2 w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-300"
                      style={{ width: `${(1 - estimatedRatio) * 100}%` }}
                    />
                  </div>
                </div>

                <button
                  onClick={handleCompress}
                  disabled={isProcessing || loading || loadFailed}
                  className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /><span>Compressing…</span></>
                  ) : (
                    <><Minimize2 className="w-4 h-4" /><span>Compress PDF</span></>
                  )}
                </button>

                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  Estimated size is approximate. Actual savings vary based on
                  embedded image content and document structure.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}