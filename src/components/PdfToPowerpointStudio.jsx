import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, Info,
  FileText, RefreshCw, X as CloseIcon, Sparkles,
  CheckCircle2, AlertTriangle, Clock, Shield, Presentation,
  Image as ImageIcon, Type as TypeIcon, Layers, ShieldCheck,
  Square, Palette, Eye,
} from 'lucide-react';
import { convertPdfToPowerpoint, checkPdfPassword } from '../utils/pdfWorker';

const MODES = [
  {
    id: 'image',
    name: 'Visual fidelity',
    icon: ImageIcon,
    tagline: 'Looks exactly like the PDF',
    description:
      'Each page becomes a full-slide image at high resolution. Preserves every visual detail — fonts, charts, colors, layout. Text is not editable in PowerPoint.',
    accent: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-500',
    ring: 'ring-blue-500/20',
  },
  {
    id: 'text',
    name: 'Editable text',
    icon: TypeIcon,
    tagline: 'Real text, editable in PowerPoint',
    description:
      'Text blocks and images are extracted as separate objects. Every word is fully editable. Positions, font sizes, and colors are preserved; fonts map to installed equivalents.',
    accent: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-500',
    ring: 'ring-emerald-500/20',
  },
];

function AnimatedInfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="pf-anim-pulse-ring relative w-6 h-6 ml-1 rounded-full bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white flex items-center justify-center shadow-md shadow-orange-500/30 transition-all cursor-pointer active:scale-95 shrink-0"
      title="How does PDF to PowerPoint work?"
      aria-label="Show info"
    >
      <span
        className="absolute -inset-1 rounded-full pointer-events-none"
        style={{
          background: 'conic-gradient(from 0deg, rgba(249,115,22,0), rgba(249,115,22,0.65), rgba(249,115,22,0))',
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

function InfoModal({ onClose }) {
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
    { icon: Square, title: 'One slide per PDF page',
      desc: 'Every page of the PDF becomes one slide, in the same order. Nothing is split, dropped, or reordered.' },
    { icon: ImageIcon, title: 'Image mode preserves pixels',
      desc: 'Rendering each page as an image guarantees the slide looks identical to the PDF. Best for visual-critical decks.' },
    { icon: TypeIcon, title: 'Text mode makes text editable',
      desc: 'Each text block becomes a real PowerPoint text box. You can retype, reformat, and reflow the content.' },
    { icon: Palette, title: 'Colors and fonts are preserved',
      desc: 'Bold, italic, size, color, and font family are mapped from the PDF. Custom fonts substitute on the fly.' },
    { icon: Layers, title: 'Images stay as separate objects',
      desc: 'Text mode extracts images as separate picture shapes — not baked into a background. You can move and resize them.' },
    { icon: Shield, title: 'Ephemeral processing',
      desc: 'Files are handled in memory on our server and deleted the moment your download finishes.' },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 pf-anim-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="pf-anim-slide-up sm:pf-anim-scale-in bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Presentation className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">How PDF to PowerPoint works</h3>
              <p className="text-[11px] text-slate-500">Two modes — visual or editable</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer" aria-label="Close">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto">
          <p className="text-[12.5px] text-slate-600 leading-relaxed">
            PDFs describe positions on a page; PowerPoint slides are structured
            objects. There is no single perfect conversion — the tool gives you
            a choice based on what you need.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {points.map((p, i) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className={`pf-anim-fade-up pf-delay-${(i % 8) + 1} p-3 rounded-2xl border border-slate-200 bg-slate-50/60`}>
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
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

          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-orange-50 via-white to-white border border-orange-100 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-black text-slate-900">Which mode to pick</p>
              <p className="text-[11.5px] text-slate-600 mt-0.5 leading-snug">
                Pick <strong className="font-bold text-blue-700">Visual fidelity</strong> if the PDF
                must look identical (printed handouts, pitch decks). Pick{' '}
                <strong className="font-bold text-emerald-700">Editable text</strong> if you plan
                to modify or re-flow the content.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-bold transition cursor-pointer active:scale-[0.98]">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function ConversionProgress({ elapsed, mode }) {
  const messages = useMemo(() => (
    mode === 'text'
      ? [
          'Reading text blocks…',
          'Extracting images…',
          'Mapping fonts…',
          'Building slide shapes…',
          'Finalizing presentation…',
        ]
      : [
          'Rendering pages at high DPI…',
          'Encoding images…',
          'Assembling slides…',
          'Finalizing presentation…',
        ]
  ), [mode]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % messages.length), 2600);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5 pf-anim-fade-up">
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
          <div className="absolute inset-0 rounded-full bg-orange-200/50 blur-md" />
          <div className="absolute inset-0 pf-anim-orbit">
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-orange-400 shadow" />
          </div>
          <div className="absolute inset-0 pf-anim-orbit-slow">
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500" />
          </div>
          <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg pf-anim-breathe">
            <Presentation className="w-5 h-5 text-white" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-slate-900 tracking-tight">
            {mode === 'text' ? 'Extracting content' : 'Rendering slides'}
          </h3>
          <div className="h-5 mt-1 relative overflow-hidden">
            <p key={idx} className="absolute inset-0 text-[11.5px] text-slate-500 leading-5 pf-anim-msg">
              {messages[idx]}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Elapsed</p>
          <p className="text-lg font-black text-slate-900 tabular-nums">{elapsed}s</p>
        </div>
      </div>

      <div className="relative w-full h-1.5 bg-orange-100 rounded-full overflow-hidden">
        <div className="absolute inset-0 pf-progress-shimmer" />
        <div
          className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${Math.min(95, 10 + elapsed * 12)}%` }}
        />
      </div>
    </div>
  );
}

export default function PdfToPowerpointStudio({ tool, file, onBack }) {
  const [activeFile, setActiveFile] = useState(file);
  const newFileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);

  const [fileHealth, setFileHealth] = useState({ valid: false, size: 0, pageCount: 0 });
  const [mode, setMode] = useState('image');
  const [dpi, setDpi] = useState(150);

  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);

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
        try { isLocked = await checkPdfPassword(activeFile); }
        catch { /* ignore */ }

        if (isLocked) {
          if (!cancelled) {
            setErrorMsg(`"${activeFile.name}" is password-protected. Please unlock it first.`);
            setLoadFailed(true);
            setLoading(false);
          }
          return;
        }

        let pageCount = 0;
        try {
          const { getDocument } = await import('pdfjs-dist');
          const buf = await activeFile.arrayBuffer();
          const doc = await getDocument({ data: buf }).promise;
          pageCount = doc.numPages;
          try { doc.destroy(); } catch {}
        } catch {}

        if (!cancelled) setFileHealth({ valid: true, size, pageCount });
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
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isProcessing]);

  const handleConvert = async () => {
    setIsProcessing(true);
    setErrorMsg('');
    setResult(null);
    try {
      const output = await convertPdfToPowerpoint(activeFile, {
        mode,
        dpi,
        quality: 85,
      });
      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        originalSize: output.originalSize,
        compressedSize: output.compressedSize,
        mode: output.mode,
        slideCount: output.slideCount,
        textBoxes: output.textBoxes,
        imageCount: output.imageCount,
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

  const handleNewFile = (e) => {
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

  // =========================================================================
  // RESULT SCREEN
  // =========================================================================
  if (result) {
    const usedText = result.mode === 'text';
    return (
      <div className="bg-slate-50 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
            <button onClick={handleBack} className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-sm px-3 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
              <ArrowLeft className="w-4 h-4" /><span>Back</span>
            </button>
            <div className="flex items-center space-x-2">
              <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center`}>
                <tool.icon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">PDF to PowerPoint — Done</h2>
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
              <h3 className="text-xl font-black text-slate-900">Presentation ready</h3>
              <p className="text-xs text-slate-500">
                {result.slideCount} slide{result.slideCount === 1 ? '' : 's'} ·{' '}
                {usedText ? 'editable text' : 'image mode'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Slides</p>
                <p className="text-lg font-black text-slate-900 tabular-nums mt-0.5">{result.slideCount}</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Text boxes</p>
                <p className="text-lg font-black text-slate-900 tabular-nums mt-0.5">{result.textBoxes}</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Images</p>
                <p className="text-lg font-black text-slate-900 tabular-nums mt-0.5">{result.imageCount}</p>
              </div>
            </div>

            {usedText ? (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] text-emerald-900 text-left leading-relaxed">
                <strong>Editable text applied:</strong> every text block and image was extracted
                as a separate object. Click any word in PowerPoint to edit it.
              </div>
            ) : (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl text-[11px] text-blue-900 text-left leading-relaxed">
                <strong>Image mode applied:</strong> each PDF page was rendered as a full-slide
                image. The slides look exactly like the original PDF.
              </div>
            )}

            <p className="text-xs text-slate-500 truncate">
              File: <strong className="text-slate-800">{result.filename}</strong>
            </p>

            <div className="flex flex-col gap-3 pt-1">
              <a
                href={result.url}
                download={result.filename}
                className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-md shadow-orange-600/20 flex items-center justify-center space-x-2 transition cursor-pointer active:scale-[0.98]"
              >
                <Download className="w-4 h-4" /><span>Download PPTX</span>
              </a>
              <button onClick={handleContinue} className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer">
                Convert another file
              </button>
              <button onClick={handleBack} className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer">
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
  const activeMode = MODES.find((m) => m.id === mode) || MODES[0];

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <input
        type="file"
        ref={newFileInputRef}
        accept="application/pdf"
        className="hidden"
        onChange={handleNewFile}
      />

      {showInfoModal && <InfoModal onClose={() => setShowInfoModal(false)} />}

      <header className="sticky top-0 shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-[1100px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
          <button onClick={handleBack} className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer shrink-0">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Home</span>
          </button>

          <div className="flex items-center space-x-2 min-w-0 flex-1 justify-center">
            <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center shrink-0`}>
              {tool && <tool.icon className="w-4 h-4" />}
            </div>
            <div className="sm:block min-w-0">
              <h2 className="text-sm font-bold text-slate-900 leading-none">PDF to PowerPoint</h2>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[240px]">{activeFile?.name}</p>
            </div>
            <AnimatedInfoButton onClick={() => setShowInfoModal(true)} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleConvert}
              disabled={isProcessing || loading || loadFailed}
              className="px-3 sm:px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition cursor-pointer active:scale-[0.98]"
            >
              {isProcessing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden xs:inline">Converting…</span></>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /><span className="xs:inline">Convert PDF</span></>
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
            <div className="w-11 h-11 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Source PDF</p>
              <p className="text-sm font-bold text-slate-900 truncate">{activeFile?.name}</p>
            </div>
            <button
              onClick={() => newFileInputRef.current?.click()}
              disabled={isProcessing}
              className="text-[10px] font-bold text-orange-700 hover:text-orange-800 px-2.5 py-1.5 rounded-lg hover:bg-orange-50 transition flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Change</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4">
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Pages</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums">{loading ? '—' : (fileHealth.pageCount || '—')}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">File size</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums">{formatFileSize(fileHealth.size)}</p>
            </div>
          </div>
        </div>

        {isProcessing ? (
          <ConversionProgress elapsed={elapsed} mode={mode} />
        ) : (
          <>
            {/* Mode picker */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-1">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-slate-500" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Conversion mode</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      disabled={isProcessing}
                      className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer group ${
                        active
                          ? `${m.border} ${m.bg} ring-2 ring-offset-1 ${m.ring} shadow-sm`
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      } disabled:cursor-not-allowed`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                          active ? m.bg : 'bg-slate-100'
                        } ${active ? m.accent : 'text-slate-500'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm font-black ${active ? 'text-slate-900' : 'text-slate-700'}`}>
                              {m.name}
                            </p>
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                          </div>
                          <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${active ? m.accent : 'text-slate-400'}`}>
                            {m.tagline}
                          </p>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-3">{m.description}</p>
                    </button>
                  );
                })}
              </div>

              {mode === 'image' && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 pf-anim-slide-down">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-bold text-slate-700">Rendering quality</label>
                      <span className="text-xs font-black text-orange-700 tabular-nums bg-orange-50 px-2 py-0.5 rounded-full">
                        {dpi} DPI
                      </span>
                    </div>
                    <input
                      type="range"
                      min="72"
                      max="300"
                      step="10"
                      value={dpi}
                      onChange={(e) => setDpi(parseInt(e.target.value, 10))}
                      disabled={isProcessing}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-orange-600"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-1">
                      <span>72 (small)</span>
                      <span>150 (balanced)</span>
                      <span>300 (sharp)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* What to expect */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-2">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-orange-600" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">What to expect</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`p-3.5 rounded-2xl border ${mode === 'image' ? 'border-blue-100 bg-blue-50/60' : 'border-slate-200 bg-slate-50/60'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                    <p className="text-[11px] font-black text-blue-900">Visual fidelity</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Image mode reproduces the PDF's exact appearance. Editable text mode approximates positioning within ±10 pt.
                  </p>
                </div>
                <div className={`p-3.5 rounded-2xl border ${mode === 'text' ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/60'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <TypeIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[11px] font-black text-emerald-900">Editability</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    {mode === 'text'
                      ? 'Every text block becomes a real PowerPoint text box. Click and retype any word.'
                      : 'Text is not editable in this mode. Switch to Editable text if you need to modify content.'}
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl border border-orange-100 bg-orange-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Presentation className="w-3.5 h-3.5 text-orange-600" />
                    <p className="text-[11px] font-black text-orange-900">Slide format</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Slides match each PDF page's exact aspect ratio. No cropping, no distortion.
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                    <p className="text-[11px] font-black text-slate-800">Privacy</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Processed in server memory only. No disk, no database, no logs.
                  </p>
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-slate-900">Ready to convert</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {mode === 'text'
                      ? 'Extracting text blocks and images as editable PowerPoint objects.'
                      : `Rendering each page at ${dpi} DPI for maximum visual fidelity.`}
                  </p>
                </div>
                <button
                  onClick={handleConvert}
                  disabled={loading || loadFailed}
                  className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-orange-500/25 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shrink-0"
                >
                  {mode === 'text' ? <TypeIcon className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                  <span>Convert to PPTX</span>
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-slate-100/70 border border-slate-200">
              <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-600 leading-snug">
                Your file is processed in memory on our server and deleted the moment your download finishes.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}