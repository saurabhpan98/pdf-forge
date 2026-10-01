import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, Info,
  FileText, RefreshCw, X as CloseIcon, Sparkles,
  CheckCircle2, AlertTriangle, Shield, FileSpreadsheet,
  Table2, Layers, ShieldCheck, Type as TypeIcon, Rows3, Columns3,
  ListOrdered,
} from 'lucide-react';
import { convertPdfToExcel, checkPdfPassword } from '../utils/pdfWorker';

const MODES = [
  {
    id: 'tables',
    name: 'Tables only',
    icon: Table2,
    tagline: 'Recommended',
    description:
      'Extract actual tables as clean spreadsheets. Each table becomes a sheet with proper headers, borders, freeze panes, and auto-filter. Pages without tables are skipped.',
    accent: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-500',
    ring: 'ring-emerald-500/20',
  },
  {
    id: 'mixed',
    name: 'Tables + text',
    icon: Layers,
    tagline: 'Fallback',
    description:
      'Extract tables first, then append any remaining text as rows. Useful for documents where tables and prose are mixed. May produce duplicate content.',
    accent: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-500',
    ring: 'ring-blue-500/20',
  },
  {
    id: 'text',
    name: 'Text only',
    icon: TypeIcon,
    tagline: 'No tables',
    description:
      'Skip table detection entirely. One line of text per row, one sheet per page. Best for text-heavy documents without structured data.',
    accent: 'text-slate-600',
    bg: 'bg-slate-100',
    border: 'border-slate-500',
    ring: 'ring-slate-400/20',
  },
];

function AnimatedInfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="pf-anim-pulse-ring relative w-6 h-6 ml-1 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white flex items-center justify-center shadow-md shadow-emerald-500/30 transition-all cursor-pointer active:scale-95 shrink-0"
      title="How does PDF to Excel work?"
      aria-label="Show info"
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
    { icon: Table2, title: 'Real table detection',
      desc: 'pdfplumber reads the PDF\'s grid lines and cell boundaries. Real tables become real Excel tables, not just text dumps.' },
    { icon: Rows3, title: 'Multi-line cells merge',
      desc: 'A wrapped cell in the PDF (spanning several visual rows) becomes a single Excel cell, not many.' },
    { icon: Columns3, title: 'Column widths from PDF',
      desc: 'Excel column widths are measured from the actual PDF cell bounding boxes so the layout matches what you see.' },
    { icon: ListOrdered, title: 'Numbers stay numbers',
      desc: 'Currency, percentages, and accounting negatives are parsed into real Excel numeric values so formulas work.' },
    { icon: Layers, title: 'Multi-page tables join',
      desc: 'A table that spans several PDF pages becomes one continuous Excel sheet with a single header row.' },
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
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">How PDF to Excel works</h3>
              <p className="text-[11px] text-slate-500">Real tables, real numbers</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer" aria-label="Close">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto">
          <p className="text-[12.5px] text-slate-600 leading-relaxed">
            PDFs don't have tables — they have text positioned on a grid. Turning that
            grid back into clean spreadsheet data is a reverse-engineering problem.
            This tool uses pdfplumber's table detection plus a set of post-processing
            steps to produce genuinely usable Excel files.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {points.map((p, i) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className={`pf-anim-fade-up pf-delay-${(i % 8) + 1} p-3 rounded-2xl border border-slate-200 bg-slate-50/60`}>
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
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-black text-slate-900">Best results</p>
              <p className="text-[11.5px] text-slate-600 mt-0.5 leading-snug">
                Documents with visible table borders (invoices, statements, financial
                reports) convert with 70–90% fidelity. Borderless or heavily merged
                tables may need manual cleanup. Scanned PDFs need OCR first.
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
      ? ['Reading pages…', 'Extracting text lines…', 'Building sheets…']
      : [
          'Analyzing page layout…',
          'Detecting table boundaries…',
          'Extracting cell data…',
          'Merging multi-line cells…',
          'Formatting spreadsheets…',
        ]
  ), [mode]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % messages.length), 2400);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5 pf-anim-fade-up">
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
          <div className="absolute inset-0 rounded-full bg-emerald-200/50 blur-md" />
          <div className="absolute inset-0 pf-anim-orbit">
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow" />
          </div>
          <div className="absolute inset-0 pf-anim-orbit-slow">
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-teal-500" />
          </div>
          <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg pf-anim-breathe">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-slate-900 tracking-tight">
            Building your spreadsheet
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

      <div className="relative w-full h-1.5 bg-emerald-100 rounded-full overflow-hidden">
        <div className="absolute inset-0 pf-progress-shimmer" />
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${Math.min(95, 10 + elapsed * 12)}%` }}
        />
      </div>
    </div>
  );
}

export default function PdfToExcelStudio({ tool, file, onBack }) {
  const [activeFile, setActiveFile] = useState(file);
  const newFileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);

  const [fileHealth, setFileHealth] = useState({ valid: false, size: 0, pageCount: 0, hasText: null });
  const [mode, setMode] = useState('tables');

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
        let hasText = null;
        try {
          const { getDocument } = await import('pdfjs-dist');
          const buf = await activeFile.arrayBuffer();
          const doc = await getDocument({ data: buf }).promise;
          pageCount = doc.numPages;
          try {
            const p1 = await doc.getPage(1);
            const tc = await p1.getTextContent();
            hasText = tc.items.some((it) => it.str && it.str.trim().length > 0);
          } catch {}
          try { doc.destroy(); } catch {}
        } catch {}

        if (!cancelled) setFileHealth({ valid: true, size, pageCount, hasText });
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
      const output = await convertPdfToExcel(activeFile, { mode });
      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        originalSize: output.originalSize,
        compressedSize: output.compressedSize,
        mode: output.mode,
        tableCount: output.tableCount,
        rowCount: output.rowCount,
        sheetCount: output.sheetCount,
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

  if (result) {
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
              <h2 className="text-sm font-bold text-slate-900">PDF to Excel — Done</h2>
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
              <h3 className="text-xl font-black text-slate-900">Spreadsheet ready</h3>
              <p className="text-xs text-slate-500">
                {result.tableCount} table{result.tableCount === 1 ? '' : 's'} ·{' '}
                {result.rowCount} row{result.rowCount === 1 ? '' : 's'} ·{' '}
                {result.sheetCount} sheet{result.sheetCount === 1 ? '' : 's'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Sheets</p>
                <p className="text-lg font-black text-slate-900 tabular-nums mt-0.5">{result.sheetCount}</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tables</p>
                <p className="text-lg font-black text-slate-900 tabular-nums mt-0.5">{result.tableCount}</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Rows</p>
                <p className="text-lg font-black text-slate-900 tabular-nums mt-0.5">{result.rowCount}</p>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] text-emerald-900 text-left leading-relaxed">
              <strong>Quality checks applied:</strong> numeric cells parsed as numbers,
              multi-line cells merged, columns measured from the PDF, and every sheet
              has frozen headers with auto-filter enabled.
            </div>

            <p className="text-xs text-slate-500 truncate">
              File: <strong className="text-slate-800">{result.filename}</strong>
            </p>

            <div className="flex flex-col gap-3 pt-1">
              <a
                href={result.url}
                download={result.filename}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-2 transition cursor-pointer active:scale-[0.98]"
              >
                <Download className="w-4 h-4" /><span>Download XLSX</span>
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

  const isScanned = fileHealth.hasText === false;

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
              <h2 className="text-sm font-bold text-slate-900 leading-none">PDF to Excel</h2>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[240px]">{activeFile?.name}</p>
            </div>
            <AnimatedInfoButton onClick={() => setShowInfoModal(true)} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleConvert}
              disabled={isProcessing || loading || loadFailed}
              className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition cursor-pointer active:scale-[0.98]"
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

        {isScanned && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 pf-anim-fade-up">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-black text-amber-900">This PDF appears to be a scan</p>
              <p className="text-[11.5px] text-amber-800 mt-0.5 leading-snug">
                No text layer was detected. Run this file through <strong>OCR PDF</strong> first
                to add a searchable text layer, then convert again.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Source PDF</p>
              <p className="text-sm font-bold text-slate-900 truncate">{activeFile?.name}</p>
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
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-1">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-slate-500" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Extraction mode</h3>
              </div>
              <div className="space-y-2.5">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      disabled={isProcessing}
                      className={`w-full p-4 rounded-2xl border-2 text-left transition-all cursor-pointer group ${
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-black ${active ? 'text-slate-900' : 'text-slate-700'}`}>
                              {m.name}
                            </p>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                              m.tagline === 'Recommended'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>{m.tagline}</span>
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed mt-2">{m.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-2">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fidelity features</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ListOrdered className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[11px] font-black text-emerald-900">Number parsing</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Currency, percentages, thousands separators, and accounting negatives
                    become real numeric cells.
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Rows3 className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[11px] font-black text-emerald-900">Multi-line merging</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Wrapped cells merge into one cell instead of spilling across multiple rows.
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Columns3 className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[11px] font-black text-emerald-900">Geometric widths</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Column widths come from the PDF's actual cell bboxes so the sheet
                    looks like the document.
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[11px] font-black text-emerald-900">Sheet polish</p>
                  </div>
                  <p className="text-[10.5px] text-slate-600 leading-snug">
                    Frozen header rows, auto-filter, and wrapped text — ready to use immediately.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up pf-delay-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-slate-900">Ready to convert</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {mode === 'tables'
                      ? 'Extracting tables as clean spreadsheet data.'
                      : mode === 'mixed'
                      ? 'Extracting tables and appending remaining text.'
                      : 'Dumping text one line per row, one sheet per page.'}
                  </p>
                </div>
                <button
                  onClick={handleConvert}
                  disabled={loading || loadFailed}
                  className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Convert to XLSX</span>
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