import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, Info,
  Camera, CameraOff, RotateCw, X as CloseIcon,
  Trash2, Plus, Sparkles,
  Sun, Contrast, Palette, Droplet,
  Grid3X3, CheckCircle2, AlertTriangle,
  Image as ImageIcon, FileText,
  ScanLine, Crop, Wand2, GripVertical,
} from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import {
  loadOpenCV,
  detectDocumentCorners,
  warpPerspective,
  enhanceImage,
  downsampleCanvas,
} from '../utils/documentScanner';
import { buildScannedPdf } from '../utils/pdfWorker';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ENHANCE_MODES = [
  { id: 'color', label: 'Color', icon: Palette,  desc: 'Preserves colors' },
  { id: 'gray',  label: 'Gray',  icon: Contrast, desc: 'Removes paper tint' },
  { id: 'bw',    label: 'B&W',   icon: Droplet,  desc: 'Pure black text' },
];

const QUALITY_PRESETS = [
  { id: 'small',  label: 'Small file',  quality: 0.65, maxPx: 1400 },
  { id: 'medium', label: 'Balanced',    quality: 0.82, maxPx: 2000 },
  { id: 'large',  label: 'High detail', quality: 0.94, maxPx: 3000 },
];

// ---------------------------------------------------------------------------
// Animated info button
// ---------------------------------------------------------------------------
function AnimatedInfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="pf-anim-pulse-ring relative w-6 h-6 ml-1 rounded-full bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white flex items-center justify-center shadow-md shadow-red-500/30 transition-all cursor-pointer active:scale-95 shrink-0"
      title="How does Scan to PDF work?"
      aria-label="Show scan info"
    >
      <span
        className="absolute -inset-1 rounded-full pointer-events-none"
        style={{
          background: 'conic-gradient(from 0deg, rgba(239,68,68,0), rgba(239,68,68,0.65), rgba(239,68,68,0))',
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

  const steps = [
    { n: 1, icon: Camera, title: 'Capture the page', desc: 'Point your camera at the document. The live grid overlay helps you frame it flat and straight.' },
    { n: 2, icon: Crop, title: 'Adjust the corners', desc: 'Auto-detection finds the document edges. Drag any corner if the detection is off.' },
    { n: 3, icon: Wand2, title: 'Enhance the image', desc: 'Pick Color, Grayscale, or Black & White. Fine-tune brightness and contrast until it looks like a real scan.' },
    { n: 4, icon: FileText, title: 'Assemble the PDF', desc: 'Capture multiple pages, reorder them by dragging, and download a single multi-page PDF.' },
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
            <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <ScanLine className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">How Scan to PDF works</h3>
              <p className="text-[11px] text-slate-500">Camera to clean PDF, entirely in your browser</p>
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

        <div className="px-5 sm:px-6 py-5 space-y-3 overflow-y-auto">
          <p className="text-[12.5px] text-slate-600 leading-relaxed">
            Turn your phone into a document scanner. Nothing is uploaded — all processing
            runs locally in your browser using WebAssembly and the canvas API.
          </p>

          <div className="space-y-2.5">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.n}
                  className={`pf-anim-fade-up pf-delay-${i + 1} p-3 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-start gap-3`}
                >
                  <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-slate-900">
                      <span className="text-red-500 mr-1">{s.n}.</span>
                      {s.title}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-red-50 via-white to-white border border-red-100 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-black text-slate-900">Tips for the best result</p>
              <ul className="text-[11.5px] text-slate-600 mt-1 space-y-1 leading-snug">
                <li>• Use a plain, high-contrast background (a dark table works well).</li>
                <li>• Light the page evenly — avoid hard shadows.</li>
                <li>• Hold the camera directly above the document for the flattest perspective.</li>
                <li>• Black &amp; White mode gives the crispest text, but loses colors.</li>
              </ul>
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
// Camera view
// ---------------------------------------------------------------------------
function CameraView({
  videoRef, active, error, hasCamera,
  onCapture, onSwitch, onPickFile, onRequestCamera,
  captureFlash, showGrid, onToggleGrid,
}) {
  const [opencvLoading, setOpencvLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOpencvLoading(true);
    loadOpenCV().then(() => { if (!cancelled) setOpencvLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="relative w-full h-full bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {active && showGrid && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-[8%] border-2 border-white/40 rounded-lg" />
          <div className="absolute inset-[8%] grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/20" />
            ))}
          </div>
        </div>
      )}

      {captureFlash && (
        <div
          className="absolute inset-0 bg-white pf-anim-fade-in pointer-events-none"
          style={{ animationDuration: '0.15s' }}
        />
      )}

      {!active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center space-y-4 bg-slate-900">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
            <CameraOff className="w-8 h-8 text-slate-500" />
          </div>
          <div className="space-y-1.5 max-w-xs">
            <h3 className="text-base font-black text-white">
              {hasCamera ? 'Camera is off' : 'Camera not available'}
            </h3>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              {error || 'Start the camera to scan a document, or import pages from your device.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            {hasCamera && (
              <button
                onClick={onRequestCamera}
                className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Start camera</span>
              </button>
            )}
            <button
              onClick={onPickFile}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition cursor-pointer border border-white/20"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Import from device</span>
            </button>
          </div>
        </div>
      )}

      {active && (
        <>
          <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between gap-2">
            <button
              onClick={onToggleGrid}
              className={`p-2.5 rounded-xl backdrop-blur-md transition cursor-pointer ${
                showGrid ? 'bg-white/90 text-slate-900' : 'bg-slate-900/60 text-white'
              }`}
              title={showGrid ? 'Hide grid' : 'Show grid'}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>

            <div className="px-3 py-1.5 rounded-full backdrop-blur-md bg-slate-900/60 text-white text-[11px] font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span>Live</span>
            </div>

            <button
              onClick={onSwitch}
              className="p-2.5 rounded-xl backdrop-blur-md bg-slate-900/60 text-white transition cursor-pointer"
              title="Switch camera"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-6 pb-8 flex items-center justify-center gap-6">
            <button
              onClick={onPickFile}
              className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 transition cursor-pointer"
              title="Import from device"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            <button
              onClick={onCapture}
              className="relative w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-2xl active:scale-95 transition cursor-pointer"
              title="Capture page"
            >
              <div className="w-16 h-16 rounded-full border-4 border-slate-900/10 bg-white" />
              <div className="absolute inset-1.5 rounded-full border-2 border-slate-900/20" />
            </button>

            <div className="w-12 h-12" />
          </div>

          {opencvLoading && (
            <div className="absolute bottom-32 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full backdrop-blur-md bg-slate-900/80 text-white text-[10px] font-bold flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Loading auto-detect…</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit view — corner adjustment + enhancement
// ---------------------------------------------------------------------------
function EditView({
  sourceCanvas, corners, setCorners,
  enhancement, setEnhancement,
  brightness, setBrightness,
  contrast, setContrast,
  onApply, onCancel,
  isProcessing, detectionRan, detectionFailed,
}) {
  const containerRef = useRef(null);
  const [imgDims, setImgDims] = useState({ w: 1, h: 1, displayW: 1, displayH: 1 });
  const [previewCanvas, setPreviewCanvas] = useState(null);
  const [previewDirty, setPreviewDirty] = useState(true);
  const [draggingCorner, setDraggingCorner] = useState(null);
  const [pillVisible, setPillVisible] = useState(false);

  // Show the detection pill, then auto-dismiss after 5 seconds
  useEffect(() => {
    if (!detectionRan) return;
    setPillVisible(true);
    const t = setTimeout(() => setPillVisible(false), 5000);
    return () => clearTimeout(t);
  }, [detectionRan]);

  useEffect(() => {
    if (!sourceCanvas) return;
    setImgDims((prev) => ({ ...prev, w: sourceCanvas.width, h: sourceCanvas.height }));
  }, [sourceCanvas]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !imgDims.w) return;
    const update = () => {
      const availW = el.clientWidth - 24;
      const availH = el.clientHeight - 24;
      const scale = Math.min(availW / imgDims.w, availH / imgDims.h);
      setImgDims((prev) => ({
        ...prev,
        displayW: Math.round(imgDims.w * scale),
        displayH: Math.round(imgDims.h * scale),
      }));
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [imgDims.w, imgDims.h]);

  useEffect(() => {
    if (!sourceCanvas) return;
    let cancelled = false;
    setPreviewDirty(true);
    const t = setTimeout(async () => {
      if (cancelled) return;
      const warped = await warpPerspective(sourceCanvas, corners);
      const enhanced = enhanceImage(warped, enhancement, brightness, contrast);
      const small = downsampleCanvas(enhanced, 900);
      if (!cancelled) {
        setPreviewCanvas(small);
        setPreviewDirty(false);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sourceCanvas, corners, enhancement, brightness, contrast]);

  const beginDrag = (idx, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingCorner(idx);

    const onMove = (ev) => {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const el = containerRef.current;
      if (!el) return;
      const frameEl = el.querySelector('[data-scan-frame="1"]');
      if (!frameEl) return;
      const fRect = frameEl.getBoundingClientRect();
      const px = clientX - fRect.left;
      const py = clientY - fRect.top;
      const x = Math.max(0, Math.min(imgDims.w, (px / imgDims.displayW) * imgDims.w));
      const y = Math.max(0, Math.min(imgDims.h, (py / imgDims.displayH) * imgDims.h));
      setCorners((prev) => {
        const next = [...prev];
        next[idx] = { x, y };
        return next;
      });
    };

    const onUp = () => {
      setDraggingCorner(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove, { passive: false });
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  const displayCorners = corners.map((c) => ({
    x: (c.x / imgDims.w) * imgDims.displayW,
    y: (c.y / imgDims.h) * imgDims.displayH,
  }));
  const polygonPoints = displayCorners.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <div className="flex flex-col h-full bg-slate-900 relative">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex items-center justify-center p-3 relative"
      >
        <div
          data-scan-frame="1"
          className="relative bg-white rounded-lg overflow-hidden shadow-2xl"
          style={{ width: `${imgDims.displayW}px`, height: `${imgDims.displayH}px` }}
        >
          <img
            src={sourceCanvas?.toDataURL('image/jpeg', 0.8)}
            alt="Captured"
            draggable={false}
            className="absolute inset-0 w-full h-full select-none pointer-events-none"
          />

          {previewCanvas && !previewDirty && (
            <img
              src={previewCanvas.toDataURL('image/jpeg', 0.7)}
              alt="Preview"
              draggable={false}
              className="absolute inset-0 w-full h-full select-none pointer-events-none opacity-60"
            />
          )}

          <svg
            className="absolute inset-0 pointer-events-none"
            width={imgDims.displayW}
            height={imgDims.displayH}
            viewBox={`0 0 ${imgDims.displayW} ${imgDims.displayH}`}
          >
            <defs>
              <mask id="scanMask">
                <rect x="0" y="0" width={imgDims.displayW} height={imgDims.displayH} fill="white" />
                <polygon points={polygonPoints} fill="black" />
              </mask>
            </defs>
            <rect
              x="0" y="0"
              width={imgDims.displayW} height={imgDims.displayH}
              fill="rgba(0,0,0,0.55)"
              mask="url(#scanMask)"
            />
            <polygon
              points={polygonPoints}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>

          {displayCorners.map((c, i) => (
            <button
              key={i}
              onMouseDown={(e) => beginDrag(i, e)}
              onTouchStart={(e) => beginDrag(i, e)}
              className={`absolute rounded-full shadow-lg cursor-grab active:cursor-grabbing transition-transform ${
                draggingCorner === i ? 'scale-125 bg-red-600' : 'bg-white'
              }`}
              style={{
                width: 28, height: 28,
                borderColor: '#ef4444',
                borderWidth: 3,
                borderStyle: 'solid',
                left: c.x - 14,
                top: c.y - 14,
                touchAction: 'none',
              }}
              title={`Corner ${i + 1}`}
            />
          ))}

          {isProcessing && (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
                <p className="text-[11px] font-bold text-white">Processing…</p>
              </div>
            </div>
          )}
        </div>

        {/* Detection pill — small, top-right, auto-dismissing */}
        {pillVisible && detectionRan && (
          <button
            type="button"
            onClick={() => setPillVisible(false)}
            className="absolute top-6 left-1/2 max-w-[55%] sm:max-w-[70%] px-2.5 py-1.5 rounded-full backdrop-blur-md bg-slate-900/85 text-white text-[10px] font-bold shadow-lg flex items-center gap-1.5 pf-anim-slide-down cursor-pointer"
            title="Tap to dismiss"
          >
            {detectionFailed ? (
              <>
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate">Adjust corners manually</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">Corners auto-detected</span>
              </>
            )}
            <CloseIcon className="w-3 h-3 text-slate-400 shrink-0" />
          </button>
        )}
      </div>

      <div className="shrink-0 bg-white border-t border-slate-200 p-4 space-y-4 max-h-[46vh] overflow-y-auto">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
            Enhancement
          </p>
          <div className="grid grid-cols-3 gap-2">
            {ENHANCE_MODES.map((m) => {
              const Icon = m.icon;
              const activeMode = enhancement === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setEnhancement(m.id)}
                  className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition cursor-pointer ${
                    activeMode
                      ? 'border-red-500 bg-red-50/60 ring-2 ring-red-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${activeMode ? 'text-red-600' : 'text-slate-500'}`} />
                  <span className={`text-[11px] font-black ${activeMode ? 'text-red-700' : 'text-slate-700'}`}>
                    {m.label}
                  </span>
                  <span className="text-[9px] text-slate-500 leading-tight text-center">{m.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                <Sun className="w-3 h-3" />
                Brightness
              </label>
              <span className="text-[10px] font-bold text-slate-700 tabular-nums bg-slate-100 px-2 py-0.5 rounded-full">
                {brightness}%
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="180"
              value={brightness}
              onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-red-600"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                <Contrast className="w-3 h-3" />
                Contrast
              </label>
              <span className="text-[10px] font-bold text-slate-700 tabular-nums bg-slate-100 px-2 py-0.5 rounded-full">
                {contrast}%
              </span>
            </div>
            <input
              type="range"
              min="60"
              max="200"
              value={contrast}
              onChange={(e) => setContrast(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-red-600"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-bold transition cursor-pointer disabled:opacity-50"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={isProcessing}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-2xl text-sm font-bold shadow-md shadow-red-600/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{isProcessing ? 'Processing…' : 'Add page'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review view — pointer-based drag reorder (works on desktop AND touch)
// ---------------------------------------------------------------------------
function ReviewView({
  pages, onReorder, onDelete, onAddMore,
  quality, setQuality, onGenerate, isBuilding,
}) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const gridRef = useRef(null);
  const dragRef = useRef({
    timer: null,
    active: false,
    fromIndex: null,
    pointerId: null,
    startX: 0,
    startY: 0,
  });

  // Prevent scrolling while a drag is active
  useEffect(() => {
    if (draggedIndex === null) return;
    const el = gridRef.current;
    if (!el) return;
    const prevent = (e) => { if (dragRef.current.active) e.preventDefault(); };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, [draggedIndex]);

  const beginDrag = (index, e) => {
    // Only primary pointer
    if (!e.isPrimary) return;

    const isMouse = e.pointerType === 'mouse';
    const ref = dragRef.current;

    ref.startX = e.clientX;
    ref.startY = e.clientY;
    ref.fromIndex = index;
    ref.pointerId = e.pointerId;
    ref.active = false;

    // Cancel any pending timer
    if (ref.timer) { clearTimeout(ref.timer); ref.timer = null; }

    if (isMouse) {
      // Mouse: start immediately
      ref.active = true;
      setDraggedIndex(index);
      setOverIndex(index);
    } else {
      // Touch / pen: wait 250 ms for a long-press
      ref.timer = setTimeout(() => {
        ref.timer = null;
        ref.active = true;
        setDraggedIndex(index);
        setOverIndex(index);
        try { if (navigator.vibrate) navigator.vibrate(12); } catch { /* ignore */ }
      }, 250);
    }

    // Attach global listeners
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const onMove = (e) => {
    const ref = dragRef.current;
    if (ref.pointerId !== e.pointerId) return;

    if (!ref.active) {
      // If the finger moves too far before the long-press fires, cancel
      const dx = e.clientX - ref.startX;
      const dy = e.clientY - ref.startY;
      if (Math.hypot(dx, dy) > 10) {
        if (ref.timer) { clearTimeout(ref.timer); ref.timer = null; }
        ref.pointerId = null;
        ref.fromIndex = null;
      }
      return;
    }

    // Active drag: find the card under the pointer
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const card = el && el.closest ? el.closest('[data-review-index]') : null;
    if (card) {
      const overIdx = parseInt(card.getAttribute('data-review-index'), 10);
      if (!isNaN(overIdx) && overIdx !== overIndex) {
        setOverIndex(overIdx);
      }
    }
  };

  const onUp = (e) => {
    const ref = dragRef.current;
    if (ref.pointerId !== e.pointerId) return;

    if (ref.timer) { clearTimeout(ref.timer); ref.timer = null; }

    const wasActive = ref.active;
    const fromIdx = ref.fromIndex;
    const toIdx = overIndex;

    ref.active = false;
    ref.fromIndex = null;
    ref.pointerId = null;

    setDraggedIndex(null);
    setOverIndex(null);

    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);

    if (wasActive && fromIdx != null && toIdx != null && fromIdx !== toIdx) {
      onReorder(fromIdx, toIdx);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* Hint */}
        <div className="mb-3 p-2.5 bg-red-50 border border-red-100 rounded-2xl text-[11px] text-red-900 flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span>
            <strong>Drag any page</strong> to reorder. On mobile, press and hold first.
          </span>
        </div>

        <div
          ref={gridRef}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
        >
          {pages.map((page, i) => {
            const isDragging = draggedIndex === i;
            const isOver = overIndex === i && draggedIndex !== null && draggedIndex !== i;

            return (
              <div
                key={page.id}
                data-review-index={i}
                onPointerDown={(e) => beginDrag(i, e)}
                onContextMenu={(e) => { if (dragRef.current.active) e.preventDefault(); }}
                style={{
                  touchAction: draggedIndex !== null ? 'none' : 'manipulation',
                  WebkitTouchCallout: draggedIndex !== null ? 'none' : 'default',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
                className={`group relative rounded-2xl border-2 bg-white overflow-hidden shadow-sm cursor-grab active:cursor-grabbing transition-all duration-200 ${
                  isDragging ? 'opacity-40 scale-95 border-red-400' : ''
                } ${
                  isOver
                    ? 'border-red-500 ring-4 ring-red-400/30 scale-105 shadow-lg z-10 bg-red-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center overflow-hidden">
                  <img
                    src={page.thumbnail}
                    alt={`Page ${i + 1}`}
                    className="w-full h-full object-contain pointer-events-none"
                    draggable={false}
                  />
                </div>

                {/* Position badge */}
                <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-black">
                  {i + 1}
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onDelete(i); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-white/95 backdrop-blur-md text-slate-700 hover:bg-red-50 hover:text-red-600 shadow-md flex items-center justify-center opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition cursor-pointer"
                  title="Delete page"
                  aria-label={`Delete page ${i + 1}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Grip indicator */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg bg-slate-900/70 backdrop-blur-md text-white flex items-center gap-1 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition pointer-events-none">
                  <GripVertical className="w-3 h-3" />
                  <span className="text-[9px] font-bold">Drag</span>
                </div>

                {/* "Moving" pill on the dragged card */}
                {isDragging && (
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
                    <span className="px-2 py-0.5 bg-red-500 text-white text-[9px] font-black uppercase tracking-wider rounded-full shadow pf-anim-slide-down">
                      Moving…
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add more tile */}
          <button
            type="button"
            onClick={onAddMore}
            className="aspect-[3/4] rounded-2xl border-2 border-dashed border-slate-300 bg-white hover:border-red-400 hover:bg-red-50/40 flex flex-col items-center justify-center gap-2 transition cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <Plus className="w-6 h-6 text-red-600" />
            </div>
            <span className="text-[11px] font-black text-slate-700">Add page</span>
          </button>
        </div>
      </div>

      <div className="shrink-0 bg-white border-t border-slate-200 p-4 space-y-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
            Output quality
          </p>
          <div className="grid grid-cols-3 gap-2">
            {QUALITY_PRESETS.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setQuality(q)}
                className={`p-2.5 rounded-xl border-2 text-center transition cursor-pointer ${
                  quality.id === q.id
                    ? 'border-red-500 bg-red-50/60 ring-2 ring-red-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <p className={`text-[11px] font-black ${quality.id === q.id ? 'text-red-700' : 'text-slate-700'}`}>
                  {q.label}
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5">~{q.maxPx} px</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAddMore}
            className="flex-1 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add more</span>
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isBuilding || pages.length === 0}
            className="flex-[2] py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-2xl text-sm font-bold shadow-md shadow-red-600/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            {isBuilding ? (
              <><Loader2 className="w-4 h-4 animate-spin" /><span>Building PDF…</span></>
            ) : (
              <><FileText className="w-4 h-4" /><span>Generate PDF ({pages.length})</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main studio
// ---------------------------------------------------------------------------
export default function ScanPdfStudio({ tool, file, onBack }) {
  const camera = useCamera();
  const fileInputRef = useRef(null);

  const [phase, setPhase] = useState('capture');
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [sourceCanvas, setSourceCanvas] = useState(null);
  const [corners, setCorners] = useState([]);
  const [enhancement, setEnhancement] = useState('color');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectionRan, setDetectionRan] = useState(false);
  const [detectionFailed, setDetectionFailed] = useState(false);

  const [pages, setPages] = useState([]);
  const [quality, setQuality] = useState(QUALITY_PRESETS[1]);

  const [result, setResult] = useState(null);
  const [isBuilding, setIsBuilding] = useState(false);

  useEffect(() => {
    camera.start('environment');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'capture' && camera.active) {
      camera.stop();
    }
  }, [phase, camera]);

  const handleCapture = useCallback(() => {
    const video = camera.videoRef.current;
    if (!video) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setErrorMsg('Camera is not ready yet. Please wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0);

    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 160);

    try { if (navigator.vibrate) navigator.vibrate(12); } catch { /* ignore */ }

    const inset = 0.06;
    const defaultCorners = [
      { x: w * inset, y: h * inset },
      { x: w * (1 - inset), y: h * inset },
      { x: w * (1 - inset), y: h * (1 - inset) },
      { x: w * inset, y: h * (1 - inset) },
    ];

    setSourceCanvas(canvas);
    setCorners(defaultCorners);
    setDetectionRan(false);
    setDetectionFailed(false);
    setPhase('edit');

    detectDocumentCorners(canvas).then((detected) => {
      setDetectionRan(true);
      if (detected && detected.length === 4) {
        setCorners(detected);
      } else {
        setDetectionFailed(true);
      }
    });
  }, [camera.videoRef]);

  const handlePickFile = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = '';

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);

        const w = canvas.width;
        const h = canvas.height;
        const inset = 0.04;
        setSourceCanvas(canvas);
        setCorners([
          { x: w * inset, y: h * inset },
          { x: w * (1 - inset), y: h * inset },
          { x: w * (1 - inset), y: h * (1 - inset) },
          { x: w * inset, y: h * (1 - inset) },
        ]);
        setDetectionRan(false);
        setDetectionFailed(false);
        setPhase('edit');

        detectDocumentCorners(canvas).then((detected) => {
          setDetectionRan(true);
          if (detected && detected.length === 4) {
            setCorners(detected);
          } else {
            setDetectionFailed(true);
          }
        });
      };
      img.onerror = () => setErrorMsg('Could not read this image.');
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleApplyEdit = async () => {
    if (!sourceCanvas || corners.length !== 4) return;
    setIsProcessing(true);
    setErrorMsg('');
    try {
      const warped = await warpPerspective(sourceCanvas, corners);
      const enhanced = enhanceImage(warped, enhancement, brightness, contrast);
      const thumb = downsampleCanvas(enhanced, 400);

      const id = `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newPage = {
        id,
        processedCanvas: enhanced,
        thumbnail: thumb.toDataURL('image/jpeg', 0.7),
        enhancement,
        brightness,
        contrast,
      };

      setPages((prev) => [...prev, newPage]);
      setSourceCanvas(null);
      setCorners([]);
      setPhase('review');

      setTimeout(() => camera.start(camera.facingMode), 100);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to process the page.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelEdit = () => {
    setSourceCanvas(null);
    setCorners([]);
    setDetectionRan(false);
    setDetectionFailed(false);
    setPhase('capture');
    setTimeout(() => camera.start(camera.facingMode), 100);
  };

  const handleReorder = (from, to) => {
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDeletePage = (index) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddMore = () => {
    setPhase('capture');
    setTimeout(() => camera.start(camera.facingMode), 100);
  };

  const handleGenerate = async () => {
    if (pages.length === 0) return;
    setIsBuilding(true);
    setErrorMsg('');
    try {
      const output = await buildScannedPdf(pages, {
        quality: quality.quality,
        maxPx: quality.maxPx,
      });
      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        pageCount: output.pageCount,
        size: output.compressedSize,
      });
      setPhase('done');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to build the PDF.');
    } finally {
      setIsBuilding(false);
    }
  };

  const handleBack = () => {
    camera.stop();
    if (result?.url) URL.revokeObjectURL(result.url);
    onBack();
  };

  const handleContinue = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setPages([]);
    setPhase('capture');
    setTimeout(() => camera.start(camera.facingMode), 100);
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB';
    const k = 1024;
    if (bytes < k) return `${bytes} B`;
    if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
    return `${(bytes / (k * k)).toFixed(2)} MB`;
  };

  // DONE SCREEN
  if (phase === 'done' && result) {
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
              <h2 className="text-sm font-bold text-slate-900">Scan to PDF — Done</h2>
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
              <h3 className="text-xl font-black text-slate-900">Scan complete</h3>
              <p className="text-xs text-slate-500">
                {result.pageCount} page{result.pageCount === 1 ? '' : 's'} · {formatFileSize(result.size)}
              </p>
            </div>

            <p className="text-xs text-slate-500 truncate">
              File: <strong className="text-slate-800">{result.filename}</strong>
            </p>

            <div className="flex flex-col gap-3 pt-1">
              <a
                href={result.url}
                download={result.filename}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-md shadow-red-600/20 flex items-center justify-center space-x-2 transition cursor-pointer active:scale-[0.98]"
              >
                <Download className="w-4 h-4" /><span>Download PDF</span>
              </a>
              <button
                onClick={handleContinue}
                className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer"
              >
                Scan another document
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

  return (
    <div className="bg-slate-50 h-screen flex flex-col overflow-hidden">
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePickFile}
      />

      {showInfoModal && <InfoModal onClose={() => setShowInfoModal(false)} />}

      <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-[1100px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <button
            onClick={handleBack}
            className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="xs:inline">Back to Home</span>
          </button>

          <div className="flex items-center space-x-2 min-w-0 flex-1 justify-center">
            <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center shrink-0`}>
              {tool && <tool.icon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 leading-none truncate">
                Scan to PDF
              </h2>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {pages.length > 0
                  ? `${pages.length} page${pages.length === 1 ? '' : 's'} captured`
                  : phase === 'capture'
                  ? 'Ready to capture'
                  : phase === 'edit'
                  ? 'Adjusting page'
                  : 'Review pages'}
              </p>
            </div>
            <AnimatedInfoButton onClick={() => setShowInfoModal(true)} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {phase === 'review' && pages.length > 0 && (
              <button
                onClick={() => setPhase('capture')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan more</span>
              </button>
            )}
            {phase === 'capture' && pages.length > 0 && (
              <button
                onClick={() => setPhase('review')}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition cursor-pointer active:scale-[0.98]"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Review ({pages.length})</span>
                <span className="xs:hidden">{pages.length}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="shrink-0 px-3 sm:px-4 pt-2">
          <div className="max-w-[1100px] mx-auto p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5 pf-anim-slide-down">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">{errorMsg}</p>
            <button
              onClick={() => setErrorMsg('')}
              className="text-amber-700 hover:text-amber-900 cursor-pointer"
              aria-label="Dismiss"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 min-h-0 relative">
        {phase === 'capture' && (
          <CameraView
            videoRef={camera.videoRef}
            active={camera.active}
            error={camera.error}
            hasCamera={camera.hasCamera}
            onCapture={handleCapture}
            onSwitch={camera.switchCamera}
            onPickFile={() => fileInputRef.current?.click()}
            onRequestCamera={() => camera.start('environment')}
            captureFlash={captureFlash}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid((v) => !v)}
          />
        )}

        {phase === 'edit' && sourceCanvas && (
          <EditView
            sourceCanvas={sourceCanvas}
            corners={corners}
            setCorners={setCorners}
            enhancement={enhancement}
            setEnhancement={setEnhancement}
            brightness={brightness}
            setBrightness={setBrightness}
            contrast={contrast}
            setContrast={setContrast}
            onApply={handleApplyEdit}
            onCancel={handleCancelEdit}
            isProcessing={isProcessing}
            detectionRan={detectionRan}
            detectionFailed={detectionFailed}
          />
        )}

        {phase === 'review' && (
          <ReviewView
            pages={pages}
            onReorder={handleReorder}
            onDelete={handleDeletePage}
            onAddMore={handleAddMore}
            quality={quality}
            setQuality={setQuality}
            onGenerate={handleGenerate}
            isBuilding={isBuilding}
          />
        )}
      </main>
    </div>
  );
}