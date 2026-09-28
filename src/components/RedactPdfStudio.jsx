import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, Info,
  Trash2, X as CloseIcon, ZoomIn, ZoomOut, Maximize,
  ChevronUp, ChevronDown, Eraser, ShieldAlert, EyeOff, ShieldCheck,
  Square, Layers, RotateCcw, ListChecks, Lock,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { redactPdf, checkPdfPassword } from '../utils/pdfWorker';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

const RENDER_SCALE = 1.5;

const REDACT_COLORS = [
  { id: 'black', label: 'Black', rgb: [0, 0, 0],          css: '#000000' },
  { id: 'red',   label: 'Red',   rgb: [0.86, 0.15, 0.15], css: '#dc2626' },
  { id: 'white', label: 'White', rgb: [1, 1, 1],          css: '#ffffff' },
];

const MIN_DRAW_SIZE_PX = 6;

function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  const k = 1024;
  return bytes < k * k
    ? `${(bytes / k).toFixed(1)} KB`
    : `${(bytes / (k * k)).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// Confirmation modal
// ---------------------------------------------------------------------------
function ConfirmRedactModal({ count, pageCount, fillCss, onCancel, onConfirm, busy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 pf-anim-fade-in"
      onClick={() => !busy && onCancel()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pf-anim-slide-up sm:pf-anim-scale-in bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-5 flex items-start gap-3 border-b border-slate-100">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              Apply redactions?
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                Rectangles
              </p>
              <p className="text-xl font-black text-slate-900 tabular-nums">{count}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                Pages
              </p>
              <p className="text-xl font-black text-slate-900 tabular-nums">{pageCount}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-100 flex items-start gap-2.5">
            <div
              className="w-6 h-6 rounded-md border-2 border-white shadow shrink-0"
              style={{ background: fillCss }}
              aria-hidden
            />
            <p className="text-[11.5px] text-rose-900 leading-relaxed">
              All <strong>text</strong>, <strong>images</strong>, and{' '}
              <strong>vector graphics</strong> inside these rectangles will be
              permanently removed from the PDF file — not just covered. Text
              extraction, copy/paste, and hex inspection cannot recover them.
            </p>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-3 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 rounded-2xl text-sm font-bold transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-70 text-white rounded-2xl text-sm font-bold shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            {busy ? (
              <><Loader2 className="w-4 h-4 animate-spin" /><span>Applying…</span></>
            ) : (
              <><ShieldCheck className="w-4 h-4" /><span>Apply redactions</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Redaction sidebar row
// ---------------------------------------------------------------------------
function RedactionRow({ redaction, index, pageWidth, pageHeight, colorCss, isSelected, onSelect, onDelete }) {
  const PREVIEW_W = 44;
  const PREVIEW_H = 56;
  const scaleX = PREVIEW_W / (pageWidth || 1);
  const scaleY = PREVIEW_H / (pageHeight || 1);

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-2xl border p-3 transition-all cursor-pointer ${
        isSelected
          ? 'border-rose-400 bg-rose-50/60 ring-2 ring-rose-400/20'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-14 shrink-0 relative">
          <div className="absolute inset-0 rounded-md bg-white border border-slate-200" />
          <div
            className="absolute"
            style={{
              left: `${redaction.x0 * scaleX}px`,
              top: `${redaction.y0 * scaleY}px`,
              width: `${Math.max(2, (redaction.x1 - redaction.x0) * scaleX)}px`,
              height: `${Math.max(2, (redaction.y1 - redaction.y0) * scaleY)}px`,
              background: colorCss,
              borderRadius: 1,
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-slate-900">
            Redaction {index + 1}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Page {redaction.page}
          </p>
          <p className="text-[9px] text-slate-400 mt-0.5 font-mono tabular-nums truncate">
            {Math.round(redaction.x0)},{Math.round(redaction.y0)} → {Math.round(redaction.x1)},{Math.round(redaction.y1)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
        title="Delete redaction"
        aria-label="Delete redaction"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function RedactPdfStudio({ tool, file, onBack }) {
  const pdfDocRef = useRef(null);
  const viewerRef = useRef(null);
  const pageContainerRef = useRef(null);
  const drawingRef = useRef(null);

  // Rendering state
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [userZoomed, setUserZoomed] = useState(false);
  const [pageDataUrl, setPageDataUrl] = useState('');
  const [pageDims, setPageDims] = useState({ width: 612, height: 792 });
  const [pageDimsCache, setPageDimsCache] = useState({});

  // Redaction state (PDF points, top-down Y)
  const [redactions, setRedactions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [toolMode, setToolMode] = useState('idle');
  const [drawingRect, setDrawingRect] = useState(null);
  const [fillColor, setFillColor] = useState(REDACT_COLORS[0]);

  // Save flow
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState(null);

  // Mobile sheet
  const [sheetOpen, setSheetOpen] = useState(false);

  const canvasScale = zoom * RENDER_SCALE;

  const pagesWithRedactions = useMemo(
    () => new Set(redactions.map((r) => r.page)).size,
    [redactions]
  );

  const currentPageRedactions = useMemo(
    () => redactions.filter((r) => r.page === currentPage),
    [redactions, currentPage]
  );

  // ---- Load PDF ----
  useEffect(() => {
    let cancelled = false;
    pdfDocRef.current = null;
    setLoading(true);
    setLoadFailed(false);
    setErrorMsg('');

    (async () => {
      try {
        if (!file) { setLoading(false); setLoadFailed(true); return; }
        const isLocked = await checkPdfPassword(file);
        if (isLocked) {
          if (!cancelled) {
            setErrorMsg(`"${file.name}" is password-protected. Please unlock it first.`);
            setLoadFailed(true);
            setLoading(false);
          }
          return;
        }
        const buf = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('PDF load error:', err);
          setErrorMsg('Failed to load PDF document.');
          setLoadFailed(true);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

  // ---- Render current page ----
  useEffect(() => {
    if (loading || !pdfDocRef.current || loadFailed || result) return;
    let cancelled = false;
    let renderTask = null;

    (async () => {
      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        if (cancelled) return;

        const vp = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({ canvasContext: ctx, viewport: vp });
        await renderTask.promise;
        if (cancelled) return;

        setPageDataUrl(canvas.toDataURL('image/jpeg', 0.92));
        const pdfVp = page.getViewport({ scale: 1 });
        setPageDims({ width: pdfVp.width, height: pdfVp.height });
        setPageDimsCache((prev) =>
          prev[currentPage] ? prev : { ...prev, [currentPage]: { width: pdfVp.width, height: pdfVp.height } }
        );
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) {
          console.error('Render error:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask) { try { renderTask.cancel(); } catch { /* ignore */ } }
    };
  }, [loading, loadFailed, currentPage, result]);

  // ---- Fit to viewport ----
  useEffect(() => {
    if (!pageDataUrl || !viewerRef.current || !pageDims.width) return;
    if (userZoomed) return;

    const compute = () => {
      const container = viewerRef.current;
      if (!container) return;
      const isMobile = window.innerWidth < 1024;
      const pad = isMobile ? 16 : 40;
      const availW = container.clientWidth - pad;
      const availH = container.clientHeight - pad;
      if (availW <= 0 || availH <= 0) return;

      const baseW = pageDims.width * RENDER_SCALE;
      const baseH = pageDims.height * RENDER_SCALE;
      const fitZoom = Math.min(availW / baseW, availH / baseH);
      setZoom(Math.max(0.3, Math.min(2.5, fitZoom)));
    };

    compute();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null;
    if (ro && viewerRef.current) ro.observe(viewerRef.current);
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, [pageDims, pageDataUrl, userZoomed]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (toolMode === 'draw') { setToolMode('idle'); return; }
        if (selectedId) { setSelectedId(null); return; }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        setRedactions((prev) => prev.filter((r) => r.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolMode, selectedId]);

  // ---- Drawing ----
  const beginDraw = (e) => {
    if (toolMode !== 'draw') return;
    if (!pageContainerRef.current) return;
    if (!e.isPrimary) return;

    const container = pageContainerRef.current;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    drawingRef.current = { startX, startY, currentX: startX, currentY: startY };
    setDrawingRect({ startX, startY, currentX: startX, currentY: startY });

    const onMove = (ev) => {
      if (!drawingRef.current) return;
      if (!ev.isPrimary) return;
      const r = container.getBoundingClientRect();
      const nx = Math.max(0, Math.min(r.width, ev.clientX - r.left));
      const ny = Math.max(0, Math.min(r.height, ev.clientY - r.top));
      drawingRef.current = { ...drawingRef.current, currentX: nx, currentY: ny };
      setDrawingRect({ ...drawingRef.current });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      const d = drawingRef.current;
      drawingRef.current = null;
      setDrawingRect(null);
      if (!d) return;

      const w = Math.abs(d.currentX - d.startX);
      const h = Math.abs(d.currentY - d.startY);
      if (w < MIN_DRAW_SIZE_PX || h < MIN_DRAW_SIZE_PX) return;

      const x0 = Math.min(d.startX, d.currentX);
      const y0 = Math.min(d.startY, d.currentY);
      const x1 = Math.max(d.startX, d.currentX);
      const y1 = Math.max(d.startY, d.currentY);

      const pdfX0 = x0 / canvasScale;
      const pdfY0 = y0 / canvasScale;
      const pdfX1 = x1 / canvasScale;
      const pdfY1 = y1 / canvasScale;

      const cx0 = Math.max(0, pdfX0);
      const cy0 = Math.max(0, pdfY0);
      const cx1 = Math.min(pageDims.width, pdfX1);
      const cy1 = Math.min(pageDims.height, pdfY1);

      if (cx1 - cx0 < 1 || cy1 - cy0 < 1) return;

      const id = `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newRedaction = { id, page: currentPage, x0: cx0, y0: cy0, x1: cx1, y1: cy1 };
      setRedactions((prev) => [...prev, newRedaction]);
      setSelectedId(id);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handlePagePointerDown = (e) => {
    if (e.target.closest('[data-redact-rect]')) return;
    if (e.target.closest('[data-redact-toolbar]')) return;

    if (toolMode === 'draw') {
      beginDraw(e);
    } else {
      setSelectedId(null);
    }
  };

  // ---- Mutations ----
  const deleteRedaction = (id) => {
    setRedactions((prev) => prev.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const clearCurrentPage = () => {
    setRedactions((prev) => prev.filter((r) => r.page !== currentPage));
    setSelectedId(null);
  };

  const clearAll = () => {
    setRedactions([]);
    setSelectedId(null);
    setSheetOpen(false);
  };

  // ---- Save ----
  const handleApplyClick = () => {
    if (redactions.length === 0) {
      setErrorMsg('Draw at least one redaction rectangle first.');
      return;
    }
    setErrorMsg('');
    setConfirmOpen(true);
  };

  const handleConfirmApply = async () => {
    setIsSaving(true);
    setErrorMsg('');
    try {
      const payload = redactions.map((r) => ({
        page: r.page,
        x0: r.x0,
        y0: r.y0,
        x1: r.x1,
        y1: r.y1,
      }));
      const output = await redactPdf(file, payload, {
        fillColor: fillColor.rgb,
        scrubImages: true,
        scrubGraphics: true,
      });
      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        originalSize: output.originalSize,
        compressedSize: output.compressedSize,
        count: redactions.length,
        pages: pagesWithRedactions,
      });
      setConfirmOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err.message || 'Failed to apply redactions.');
      setConfirmOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Continue editing: keep every redaction, current page, zoom, and color.
  // Only the download result is cleared so the user resumes the exact state
  // they were in before saving. Selected rectangle is cleared so nothing is
  // highlighted by accident, and draw mode is turned off so a stray tap does
  // not create a new rectangle.
  const handleContinue = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setSelectedId(null);
    setToolMode('idle');
    // redactions, currentPage, zoom, fillColor, pageDimsCache all preserved
  };

  const handleBack = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    onBack();
  };

  // ---- Zoom ----
  const zoomIn = () => { setUserZoomed(true); setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2))); };
  const zoomOut = () => { setUserZoomed(true); setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2))); };
  const resetZoom = () => { setUserZoomed(false); };

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
              <h2 className="text-sm font-bold text-slate-900">Redact PDF — Done</h2>
            </div>
            <div className="w-16" />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 max-w-md w-full text-center space-y-6 shadow-md pf-anim-scale-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Redaction complete</h3>
              <p className="text-xs text-slate-500 mt-1">
                {result.count} rectangle{result.count === 1 ? '' : 's'} removed across {result.pages} page{result.pages === 1 ? '' : 's'}
              </p>
            </div>
            <p className="text-xs text-slate-500 truncate">
              Generated file: <strong className="text-slate-800">{result.filename}</strong>
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs flex items-center justify-between">
              <span className="text-slate-500 font-semibold">{formatFileSize(result.originalSize)}</span>
              <span className="text-slate-400">→</span>
              <span className="text-emerald-700 font-bold">{formatFileSize(result.compressedSize)}</span>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] text-emerald-900 text-left leading-relaxed">
              <strong>Verified removal:</strong> The content inside each rectangle has been
              permanently deleted from the PDF content stream. Opening the file and
              attempting to select or copy the redacted area will reveal nothing.
            </div>
            <div className="flex flex-col gap-3 pt-1">
              <a
                href={result.url}
                download={result.filename}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md flex items-center justify-center space-x-2 transition cursor-pointer"
              >
                <Download className="w-4 h-4" /><span>Download redacted PDF</span>
              </a>
              <button
                onClick={handleContinue}
                className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer"
              >
                Continue editing
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
  const isDrawing = toolMode === 'draw';

  return (
    <div className="bg-slate-50 h-screen flex flex-col overflow-hidden">
      {confirmOpen && (
        <ConfirmRedactModal
          count={redactions.length}
          pageCount={pagesWithRedactions}
          fillCss={fillColor.css}
          busy={isSaving}
          onCancel={() => !isSaving && setConfirmOpen(false)}
          onConfirm={handleConfirmApply}
        />
      )}

      {/* HEADER */}
      <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button
            onClick={handleBack}
            className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-xs sm:text-sm px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Home</span>
          </button>

          <div className="flex items-center space-x-2 min-w-0">
            <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center shrink-0`}>
              {tool && <tool.icon className="w-4 h-4" />}
            </div>
            <div className="hidden sm:block min-w-0">
              <h2 className="text-sm font-bold text-slate-900 leading-none">Redact PDF</h2>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[220px]">
                {file?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {redactions.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold rounded-full">
                <Layers className="w-3 h-3" />
                {redactions.length} rect{redactions.length === 1 ? '' : 's'}
              </span>
            )}
            <button
              onClick={handleApplyClick}
              disabled={isSaving || redactions.length === 0}
              className="px-3 sm:px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition cursor-pointer active:scale-[0.98]"
            >
              {isSaving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden xs:inline">Applying…</span></>
              ) : (
                <><ShieldCheck className="w-3.5 h-3.5" /><span className="sm:inline">Apply &amp; Download</span></>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-[1600px] mx-auto w-full px-2 sm:px-4 py-2 sm:py-3 flex flex-col space-y-2 overflow-hidden">
        {/* Banners */}
        {errorMsg && (
          <div className="shrink-0 p-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-2.5 pf-anim-slide-down">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">{errorMsg}</p>
          </div>
        )}

        {/* TOOLBAR */}
        {!loading && !loadFailed && (
          <div
            data-redact-toolbar="1"
            className="shrink-0 bg-white border border-slate-200 rounded-2xl px-2 sm:px-3 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              onClick={() => {
                setToolMode((m) => (m === 'draw' ? 'idle' : 'draw'));
                setSelectedId(null);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer ${
                isDrawing
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
              title={isDrawing ? 'Exit draw mode (Esc)' : 'Enter draw mode'}
            >
              <Square className="w-3.5 h-3.5" />
              <span>{isDrawing ? 'Drawing…' : 'Draw redactions'}</span>
              {isDrawing && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden />
              )}
            </button>

            <div className="w-px h-6 bg-slate-200 shrink-0" />

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 pr-1 hidden sm:inline">
                Fill
              </span>
              {REDACT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFillColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition cursor-pointer ${
                    fillColor.id === c.id
                      ? 'border-cyan-500 ring-2 ring-cyan-500/30 scale-105'
                      : 'border-slate-300 hover:scale-105'
                  }`}
                  style={{ background: c.css }}
                  title={c.label}
                  aria-label={`Fill color ${c.label}`}
                />
              ))}
            </div>

            <div className="w-px h-6 bg-slate-200 shrink-0" />

            <button
              type="button"
              onClick={clearCurrentPage}
              disabled={currentPageRedactions.length === 0}
              className="px-2.5 py-2 rounded-xl text-[11px] font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span> page ({currentPageRedactions.length})
            </button>

            <button
              type="button"
              onClick={clearAll}
              disabled={redactions.length === 0}
              className="px-2.5 py-2 rounded-xl text-[11px] font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear all</span>
            </button>

            <div className="hidden md:flex items-center gap-1.5 ml-auto pl-3 border-l border-slate-200 text-[10px] text-slate-500 font-medium shrink-0">
              <Lock className="w-3 h-3 text-emerald-500" />
              <span>True content-stream redaction — content is removed, not covered</span>
            </div>

            {redactions.length > 0 && (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="lg:hidden ml-auto shrink-0 px-2.5 py-2 rounded-xl text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>{redactions.length}</span>
              </button>
            )}
          </div>
        )}

        {/* VIEWER + SIDEBAR */}
        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 gap-2 lg:gap-3 overflow-hidden">
          {/* Viewer wrapper — relative so the toolbar can be positioned inside
              it without scrolling with the PDF content. */}
          <div className={`relative flex-1 ${redactions.length > 0 ? 'lg:col-span-9' : 'lg:col-span-12'} min-h-0`}>

            {/* Scrollable canvas container */}
            <div
              ref={viewerRef}
              className="absolute inset-0 bg-slate-200/60 rounded-2xl lg:rounded-3xl border border-slate-200 overflow-auto flex items-start justify-center p-2 lg:p-4"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-3 text-slate-500">
                  <Loader2 className="w-9 h-9 animate-spin text-rose-500" />
                  <p className="text-xs font-semibold">Loading document…</p>
                </div>
              ) : loadFailed ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-3 text-slate-500">
                  <AlertCircle className="w-10 h-10 text-slate-400" />
                  <p className="text-xs font-semibold">Unable to display this PDF.</p>
                </div>
              ) : pageDataUrl ? (
                <div
                  ref={pageContainerRef}
                  onPointerDown={handlePagePointerDown}
                  style={{
                    position: 'relative',
                    width: `${pageDims.width * canvasScale}px`,
                    height: `${pageDims.height * canvasScale}px`,
                    cursor: isDrawing ? 'crosshair' : 'default',
                    flexShrink: 0,
                    touchAction: isDrawing ? 'none' : 'auto',
                  }}
                >
                  <img
                    src={pageDataUrl}
                    alt={`Page ${currentPage}`}
                    draggable={false}
                    style={{
                      position: 'absolute', top: 0, left: 0,
                      width: '100%', height: '100%',
                      pointerEvents: 'none', userSelect: 'none',
                    }}
                  />

                  {currentPageRedactions.map((r) => {
                    const isSelected = selectedId === r.id;
                    return (
                      <div
                        key={r.id}
                        data-redact-rect="1"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (isDrawing) return;
                          setSelectedId(r.id);
                        }}
                        className="group absolute"
                        style={{
                          left: `${r.x0 * canvasScale}px`,
                          top: `${r.y0 * canvasScale}px`,
                          width: `${(r.x1 - r.x0) * canvasScale}px`,
                          height: `${(r.y1 - r.y0) * canvasScale}px`,
                          background: fillColor.css,
                          borderRadius: 2,
                          zIndex: isSelected ? 30 : 20,
                          cursor: isDrawing ? 'crosshair' : 'pointer',
                          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                          boxShadow: isSelected
                            ? '0 0 0 2px rgba(6,182,212,0.9), 0 0 0 5px rgba(6,182,212,0.25)'
                            : 'inset 0 0 0 1px rgba(255,255,255,0.15)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteRedaction(r.id); }}
                          className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg transition opacity-0 group-hover:opacity-100 cursor-pointer z-40"
                          title="Delete redaction"
                          aria-label="Delete redaction"
                        >
                          <CloseIcon className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}

                  {drawingRect && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${Math.min(drawingRect.startX, drawingRect.currentX)}px`,
                        top: `${Math.min(drawingRect.startY, drawingRect.currentY)}px`,
                        width: `${Math.abs(drawingRect.currentX - drawingRect.startX)}px`,
                        height: `${Math.abs(drawingRect.currentY - drawingRect.startY)}px`,
                        background: fillColor.css,
                        opacity: 0.55,
                        border: '1.5px dashed rgba(255,255,255,0.8)',
                        borderRadius: 2,
                        pointerEvents: 'none',
                        zIndex: 40,
                      }}
                    />
                  )}

                  {redactions.length === 0 && !isDrawing && !drawingRect && (
                    <div className="absolute inset-x-0 top-4 flex justify-center pointer-events-none pf-anim-fade-in">
                      <div className="px-3.5 py-2 rounded-2xl bg-slate-900/85 backdrop-blur-md text-white text-[11px] font-medium shadow-lg flex items-center gap-2">
                        <Square className="w-3.5 h-3.5 text-rose-400" />
                        <span>Click <strong className="font-bold">Draw redactions</strong> in the toolbar, then drag over sensitive areas</span>
                      </div>
                    </div>
                  )}
                  {isDrawing && !drawingRect && (
                    <div className="absolute inset-x-0 top-4 flex justify-center pointer-events-none pf-anim-fade-in">
                      <div className="px-3.5 py-2 rounded-2xl bg-rose-600/95 backdrop-blur-md text-white text-[11px] font-bold shadow-lg flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span>Click and drag to mark areas for redaction</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-32 space-y-3 text-slate-500">
                  <Loader2 className="w-9 h-9 animate-spin text-rose-500" />
                  <p className="text-xs font-semibold">Preparing view…</p>
                </div>
              )}
            </div>

            {/* Toolbar — anchored to the outer wrapper, so it never scrolls
                with the canvas content. */}
            {pageDataUrl && !loading && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md text-white px-2 sm:px-3 py-1.5 rounded-2xl flex items-center space-x-1.5 sm:space-x-2 text-xs shadow-xl z-40 max-w-full overflow-x-auto no-scrollbar pointer-events-auto">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 hover:bg-slate-700 rounded-lg disabled:opacity-30 cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 hover:bg-slate-700 rounded-lg disabled:opacity-30 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-slate-600 shrink-0" />
                <span className="font-bold px-1.5 py-0.5 bg-slate-700 rounded shrink-0">{currentPage}</span>
                <span className="text-slate-400 shrink-0">/ {totalPages}</span>
                <div className="h-4 w-px bg-slate-600 shrink-0" />
                <button onClick={zoomOut} className="p-1.5 hover:bg-slate-700 rounded-lg cursor-pointer">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button onClick={zoomIn} className="p-1.5 hover:bg-slate-700 rounded-lg cursor-pointer">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-slate-300 font-semibold tabular-nums shrink-0">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={resetZoom}
                  className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 cursor-pointer"
                  title="Fit to screen"
                >
                  <Maximize className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Sidebar (desktop) */}
          {redactions.length > 0 && (
            <div className="hidden lg:flex lg:col-span-3 min-h-0 flex-col overflow-hidden">
              <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col overflow-hidden h-full">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                      Redactions
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {redactions.length} across {pagesWithRedactions} page{pagesWithRedactions === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                  {redactions
                    .slice()
                    .sort((a, b) => a.page - b.page || a.y0 - b.y0)
                    .map((r, i) => {
                      const dims = pageDimsCache[r.page] || pageDims;
                      return (
                        <RedactionRow
                          key={r.id}
                          redaction={r}
                          index={i}
                          pageWidth={dims.width}
                          pageHeight={dims.height}
                          colorCss={fillColor.css}
                          isSelected={selectedId === r.id}
                          onSelect={() => { setCurrentPage(r.page); setSelectedId(r.id); }}
                          onDelete={() => deleteRedaction(r.id)}
                        />
                      );
                    })}
                </div>

                <div className="pt-3 mt-2 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={handleApplyClick}
                    disabled={isSaving}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Apply redactions</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex flex-col justify-end pf-anim-fade-in"
          onClick={() => setSheetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="pf-anim-slide-up bg-white rounded-t-3xl p-4 shadow-2xl border-t border-slate-200 max-h-[75vh] flex flex-col space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-rose-500" />
                <h3 className="text-sm font-black text-slate-900">
                  Redactions ({redactions.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                aria-label="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {redactions
                .slice()
                .sort((a, b) => a.page - b.page || a.y0 - b.y0)
                .map((r, i) => {
                  const dims = pageDimsCache[r.page] || pageDims;
                  return (
                    <RedactionRow
                      key={r.id}
                      redaction={r}
                      index={i}
                      pageWidth={dims.width}
                      pageHeight={dims.height}
                      colorCss={fillColor.css}
                      isSelected={selectedId === r.id}
                      onSelect={() => { setCurrentPage(r.page); setSelectedId(r.id); setSheetOpen(false); }}
                      onDelete={() => deleteRedaction(r.id)}
                    />
                  );
                })}
            </div>

            <button
              type="button"
              onClick={() => { setSheetOpen(false); handleApplyClick(); }}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-sm font-bold shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Apply redactions</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}