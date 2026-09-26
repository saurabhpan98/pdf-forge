import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, PenTool,
  Type, Upload, Eraser, X, Trash2,
  ChevronUp, ChevronDown, ZoomIn, ZoomOut, Maximize, FileImage,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import SignatureCanvas from 'react-signature-canvas';
import { signPdf, checkPdfPassword } from '../utils/pdfWorker';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

const RENDER_SCALE = 1.5;

const SIGNATURE_FONTS = [
  { id: 'caveat',    label: 'Casual',    css: '"Caveat", cursive',          url: 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap' },
  { id: 'dancing',   label: 'Elegant',   css: '"Dancing Script", cursive',  url: 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap' },
  { id: 'greatvibes',label: 'Flourish',  css: '"Great Vibes", cursive',     url: 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap' },
  { id: 'satisfy',   label: 'Signature', css: '"Satisfy", cursive',         url: 'https://fonts.googleapis.com/css2?family=Satisfy&display=swap' },
  { id: 'allura',    label: 'Formal',    css: '"Allura", cursive',          url: 'https://fonts.googleapis.com/css2?family=Allura&display=swap' },
];

const _fontLoaded = new Set();
function ensureFont(font) {
  if (_fontLoaded.has(font.id)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = font.url;
  document.head.appendChild(link);
  _fontLoaded.add(font.id);
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  const k = 1024;
  return bytes < k * k ? `${(bytes / k).toFixed(1)} KB` : `${(bytes / (k * k)).toFixed(2)} MB`;
}

// Load an image (data URL) and return its natural dimensions.
function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

function trimCanvas(sourceCanvas) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (!width || !height) return null;

  const ctx = sourceCanvas.getContext('2d');
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    return null;
  }
  const data = imageData.data;

  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[rowOffset + x * 4 + 3] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0 || bottom < 0) return null;

  const pad = 8;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);

  const out = document.createElement('canvas');
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext('2d').drawImage(
    sourceCanvas,
    left, top, out.width, out.height,
    0, 0, out.width, out.height,
  );
  return out;
}

// ---------------------------------------------------------------------------
// Signature creation modal (unchanged)
// ---------------------------------------------------------------------------
function SignatureModal({ onClose, onCreated }) {
  const [mode, setMode] = useState('draw');
  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0]);
  const sigCanvasRef = useRef(null);

  useEffect(() => {
    if (mode === 'type') ensureFont(selectedFont);
  }, [mode, selectedFont]);

  useEffect(() => {
    SIGNATURE_FONTS.forEach(ensureFont);
  }, []);

  const handleClear = () => {
    if (sigCanvasRef.current) sigCanvasRef.current.clear();
  };

  const handleDrawConfirm = () => {
    const c = sigCanvasRef.current;
    if (!c || c.isEmpty()) return;
    const raw = c.getCanvas();
    const trimmed = trimCanvas(raw);
    if (!trimmed) return;
    onCreated({ dataUrl: trimmed.toDataURL('image/png'), method: 'draw' });
  };

  const handleTypeConfirm = async () => {
    if (!typedName.trim()) return;
    ensureFont(selectedFont);
    try { await document.fonts.load(`96px ${selectedFont.css}`); } catch { /* ignore */ }

    const fontSize = 96;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `${fontSize}px ${selectedFont.css}`;
    const metrics = measure.measureText(typedName);
    const width = Math.ceil(metrics.width + 40);
    const height = Math.ceil(fontSize * 1.6);

    const tmp = document.createElement('canvas');
    tmp.width = width;
    tmp.height = height;
    const ctx = tmp.getContext('2d');
    ctx.font = `${fontSize}px ${selectedFont.css}`;
    ctx.fillStyle = '#0b1220';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName, 20, height / 2);

    onCreated({ dataUrl: tmp.toDataURL('image/png'), method: 'type' });
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCreated({ dataUrl: reader.result, method: 'upload' });
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[95vh] flex flex-col">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Create your signature</h3>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Draw, type, or upload — all processing stays in your browser.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 sm:px-6 pt-3 sm:pt-4 shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl">
            {[
              { id: 'draw',   label: 'Draw',   Icon: PenTool },
              { id: 'type',   label: 'Type',   Icon: Type },
              { id: 'upload', label: 'Upload', Icon: Upload },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  mode === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto">
          {mode === 'draw' && (
            <div className="space-y-3">
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden">
                <SignatureCanvas
                  ref={sigCanvasRef}
                  penColor="#0b1220"
                  canvasProps={{
                    className: 'w-full',
                    style: {
                      width: '100%',
                      height: 'clamp(150px, 30vh, 220px)',
                      touchAction: 'none',
                    },
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
                <button
                  type="button"
                  onClick={handleDrawConfirm}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Use this signature</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'type' && (
            <div className="space-y-4">
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your name"
                autoFocus
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />

              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Pick a style
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SIGNATURE_FONTS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFont(f)}
                      className={`px-4 py-3 rounded-2xl border text-left transition cursor-pointer ${
                        selectedFont.id === f.id
                          ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                      style={{ fontFamily: f.css, fontSize: 26, color: '#0b1220' }}
                    >
                      {typedName || f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleTypeConfirm}
                  disabled={!typedName.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Use this signature</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'upload' && (
            <div className="space-y-3">
              <label className="block rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 transition p-8 sm:p-10 text-center cursor-pointer">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-800">Click to upload signature image</p>
                <p className="text-xs text-slate-500 mt-1">PNG with transparent background recommended</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
              <div className="p-3 bg-sky-50 border border-sky-100 rounded-2xl text-[11px] text-sky-900 leading-relaxed">
                <strong>Tip:</strong> If your image has a white background instead of transparent,
                it will cover whatever is beneath it on the page. Use a PNG export from a drawing
                app with transparency enabled for the cleanest result.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placed signature overlay — draggable, aspect-ratio-locked resize
//
// Coordinates:
//   • sig.x, sig.y, sig.width, sig.height   → PDF points (bottom-left origin)
//   • canvasScale = zoom × RENDER_SCALE     → screen px per PDF point
//   • sig.aspectRatio = naturalWidth / naturalHeight of the source PNG.
//     This is used to derive height from width so the preview and the
//     embedded PDF image always share the same aspect ratio — no stretching,
//     no shrinking.
// ---------------------------------------------------------------------------
function SignatureOverlay({
  sig, selected, onSelect, onChange, onDelete, pageHeightPdf, canvasScale,
}) {
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const beginDrag = (e, mode, handle = null) => {
    e.stopPropagation();
    e.preventDefault();

    const aspect = sig.aspectRatio || (sig.width / sig.height) || 1;

    dragRef.current = {
      mode, handle,
      startX: e.clientX, startY: e.clientY,
      init: { x: sig.x, y: sig.y, width: sig.width, height: sig.height },
      aspect,
    };
    setIsDragging(true);

    const onMove = (ev) => {
      const r = dragRef.current;
      if (!r) return;

      const dxScreen = ev.clientX - r.startX;
      const dyScreen = ev.clientY - r.startY;

      const dxPdf = dxScreen / canvasScale;
      const dyPdf = -dyScreen / canvasScale;   // screen down = PDF down

      if (r.mode === 'move') {
        onChange({ ...sig, x: r.init.x + dxPdf, y: r.init.y + dyPdf });
        return;
      }

      // ---- Aspect-locked resize ----
      const MIN_W = 20;
      const h = r.handle || '';

      // Derive a candidate width from horizontal drag and another from
      // vertical drag (via aspect ratio), then average them. This makes
      // diagonal drags feel natural regardless of which axis the user
      // pulls harder on.
      const wFromX = h.includes('e')
        ? r.init.width + dxPdf
        : r.init.width - dxPdf;
      const hFromY = h.includes('n')
        ? r.init.height + dyPdf
        : r.init.height - dyPdf;
      const wFromY = hFromY * r.aspect;

      let newWidth = (wFromX + wFromY) / 2;
      newWidth = Math.max(MIN_W, newWidth);
      const newHeight = newWidth / r.aspect;

      // Anchor: the corner opposite the dragged one stays fixed.
      let newX = r.init.x;
      let newY = r.init.y;
      if (h.includes('w')) {
        // Left edge moves; right edge (x + width) stays fixed.
        newX = r.init.x + r.init.width - newWidth;
      }
      if (h.includes('s')) {
        // Bottom edge moves; top edge (y + height) stays fixed.
        newY = r.init.y + r.init.height - newHeight;
      }

      onChange({ ...sig, x: newX, y: newY, width: newWidth, height: newHeight });
    };

    const onUp = () => {
      dragRef.current = null;
      setIsDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // PDF-space → screen-space.
  const leftPx = sig.x * canvasScale;
  const topPx  = (pageHeightPdf - (sig.y + sig.height)) * canvasScale;
  const widthPx  = sig.width * canvasScale;
  const heightPx = sig.height * canvasScale;

  const handleSize = 18;

  return (
    <div
      onPointerDown={(e) => { onSelect(); beginDrag(e, 'move'); }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        cursor: isDragging ? 'grabbing' : 'move',
        outline: selected ? '2px solid #6366f1' : '1px dashed rgba(99,102,241,0.5)',
        outlineOffset: 0,
        background: selected ? 'rgba(99,102,241,0.06)' : 'transparent',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* No objectFit: 'contain' here — the container IS the ink bounds now,
          because we lock the container's aspect ratio to the image's natural
          aspect. Filling the box equals showing the ink at correct
          proportions, and matches pdf-lib's stretch-to-rect behaviour. */}
      <img
        src={sig.dataUrl}
        alt="signature"
        draggable={false}
        style={{
          width: '100%', height: '100%',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />

      {selected && (
        <>
          {['nw', 'ne', 'sw', 'se'].map((h) => {
            const style = {
              position: 'absolute',
              width: handleSize, height: handleSize,
              background: 'white',
              border: '2px solid #6366f1',
              borderRadius: 3,
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              touchAction: 'none',
              zIndex: 10,
            };
            if (h.includes('n')) style.top    = `-${handleSize / 2}px`;
            if (h.includes('s')) style.bottom = `-${handleSize / 2}px`;
            if (h.includes('w')) style.left   = `-${handleSize / 2}px`;
            if (h.includes('e')) style.right  = `-${handleSize / 2}px`;
            style.cursor = (h === 'nw' || h === 'se') ? 'nwse-resize' : 'nesw-resize';

            return (
              <div
                key={h}
                onPointerDown={(e) => beginDrag(e, 'resize', h)}
                onClick={(e) => e.stopPropagation()}
                style={style}
              />
            );
          })}

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              position: 'absolute',
              top: -34, right: -4,
              background: '#e11d48', color: 'white',
              border: 'none', borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11, fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              boxShadow: '0 2px 6px rgba(225,29,72,0.3)',
              zIndex: 11,
            }}
          >
            <Trash2 size={11} /> Delete
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main studio
// ---------------------------------------------------------------------------
export default function SignPdfStudio({ tool, file, onBack }) {
  const pdfDocRef = useRef(null);
  const viewerRef = useRef(null);
  const pageContainerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [userZoomed, setUserZoomed] = useState(false);
  const [pageDataUrl, setPageDataUrl] = useState('');
  const [pageDims, setPageDims] = useState({ width: 595, height: 842 });

  const [signatures, setSignatures] = useState([]);
  const [selectedSigId, setSelectedSigId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingDataUrl, setPendingDataUrl] = useState(null);
  const [flatten, setFlatten] = useState(true);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const canvasScale = zoom * RENDER_SCALE;

  // ---- Load PDF -----------------------------------------------------------
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

  // ---- Render current page ------------------------------------------------
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

  // ---- Auto fit-to-viewport ----------------------------------------------
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
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(compute)
      : null;
    if (ro && viewerRef.current) ro.observe(viewerRef.current);
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, [pageDims, pageDataUrl, userZoomed]);

  // ---- Placement (async now, because we need the image's natural size) ---
  const handlePageClick = async (e) => {
    if (!pendingDataUrl || !pageContainerRef.current) return;
    const rect = pageContainerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Read natural dimensions so we can lock the aspect ratio.
    const { width: natW, height: natH } = await loadImageDimensions(pendingDataUrl);
    const aspect = natW / natH;

    // Default width: 25% of page width. Height derived from aspect so the
    // preview and the final PDF image always share identical proportions.
    const defaultWidthPdf = pageDims.width * 0.25;
    const defaultHeightPdf = defaultWidthPdf / aspect;

    const px = cx / canvasScale;
    const py = cy / canvasScale;

    const newSig = {
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      page: currentPage,
      x: px - defaultWidthPdf / 2,
      y: pageDims.height - py - defaultHeightPdf / 2,
      width: defaultWidthPdf,
      height: defaultHeightPdf,
      aspectRatio: aspect,
      dataUrl: pendingDataUrl,
    };

    setSignatures((prev) => [...prev, newSig]);
    setSelectedSigId(newSig.id);
    setPendingDataUrl(null);
  };

  const updateSignature = (id, patch) => {
    setSignatures((prev) => prev.map((s) => (s.id === id ? patch : s)));
  };

  const deleteSignature = (id) => {
    setSignatures((prev) => prev.filter((s) => s.id !== id));
    if (selectedSigId === id) setSelectedSigId(null);
  };

  const handleSignatureCreated = (created) => {
    setPendingDataUrl(created.dataUrl);
    setShowModal(false);
  };

  // ---- Save / continue ----------------------------------------------------
  const handleSave = async () => {
    if (signatures.length === 0) {
      setErrorMsg('Add at least one signature before saving.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const payload = signatures.map((s) => ({
        page: s.page,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        dataUrl: s.dataUrl,
        opacity: 1,
      }));
      const output = await signPdf(file, payload, { flatten });
      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        originalSize: output.originalSize,
        compressedSize: output.compressedSize,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err.message || 'Failed to sign PDF.');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setSelectedSigId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    onBack();
  };

  const zoomIn = () => { setUserZoomed(true); setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2))); };
  const zoomOut = () => { setUserZoomed(true); setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2))); };
  const resetZoom = () => { setUserZoomed(false); };

  // =========================================================================
  // Result screen
  // =========================================================================
  if (result) {
    return (
      <div className="bg-slate-50 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
            <button onClick={handleBack} className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-sm px-3 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
              <ArrowLeft className="w-4 h-4" /><span>Back to Home</span>
            </button>
            <div className="flex items-center space-x-2">
              <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center`}>
                <tool.icon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">Sign PDF — Done</h2>
            </div>
            <div className="w-20" />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 max-w-md w-full text-center space-y-6 shadow-md">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-black text-slate-900">PDF Signed Successfully</h3>
            <p className="text-xs text-slate-500 truncate">
              Generated file: <strong className="text-slate-800">{result.filename}</strong>
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs flex items-center justify-between">
              <span className="text-slate-500 font-semibold">{formatFileSize(result.originalSize)}</span>
              <span className="text-slate-400">→</span>
              <span className="text-emerald-700 font-bold">{formatFileSize(result.compressedSize)}</span>
            </div>
            <div className="flex flex-col gap-3 pt-1">
              <a
                href={result.url}
                download={result.filename}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-2 transition"
              >
                <Download className="w-4 h-4" /><span>Download Signed PDF</span>
              </a>
              <button
                onClick={handleContinue}
                className="w-full py-3 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-bold transition cursor-pointer"
              >
                Sign Again
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
  // Editor
  // =========================================================================
  const sigsOnPage = signatures.filter((s) => s.page === currentPage);
  const hasSigs = signatures.length > 0;

  return (
    <div className="bg-slate-50 h-screen flex flex-col overflow-hidden">
      {showModal && (
        <SignatureModal
          onClose={() => setShowModal(false)}
          onCreated={handleSignatureCreated}
        />
      )}

      <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <button onClick={handleBack} className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-xs sm:text-sm px-2 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Back</span>
          </button>
          <div className="flex items-center space-x-2 min-w-0">
            <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center shrink-0`}>
              {tool && <tool.icon className="w-4 h-4" />}
            </div>
            <div className="hidden sm:block min-w-0">
              <h2 className="text-sm font-bold text-slate-900 leading-none">Sign PDF</h2>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[220px]">{file?.name}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            {signatures.length > 0 && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold rounded-full">
                {signatures.length}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || signatures.length === 0}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition cursor-pointer"
            >
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden xs:inline">Saving…</span></>
              ) : (
                <><Download className="w-3.5 h-3.5" /><span className="xs:inline">Process Signed PDF</span></>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-[1600px] mx-auto w-full px-2 sm:px-4 py-2 sm:py-3 flex flex-col space-y-2 overflow-hidden">
        {errorMsg && (
          <div className="shrink-0 p-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">{errorMsg}</p>
          </div>
        )}

        {!loading && !loadFailed && (
          <div className="shrink-0 bg-white border border-slate-200 rounded-xl px-2 sm:px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Add Signature</span>
            </button>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 ml-auto">
              <input
                type="checkbox"
                checked={flatten}
                onChange={(e) => setFlatten(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span>Flatten</span>
            </label>
          </div>
        )}

         <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 gap-2 lg:gap-3 overflow-hidden">
          <div
            ref={viewerRef}
            className={`flex-1 ${hasSigs ? 'lg:col-span-9' : 'lg:col-span-12'} min-h-0 bg-slate-200/60 rounded-2xl lg:rounded-3xl border border-slate-200 overflow-auto flex items-start justify-center p-2 lg:p-4`}
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-3 text-slate-500">
                <Loader2 className="w-9 h-9 animate-spin text-indigo-500" />
                <p className="text-xs font-semibold">Loading document…</p>
              </div>
            ) : loadFailed ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-3 text-slate-500">
                <FileImage className="w-10 h-10 text-slate-400" />
                <p className="text-xs font-semibold">Unable to display this PDF.</p>
              </div>
            ) : pageDataUrl ? (
              <div
                ref={pageContainerRef}
                onClick={handlePageClick}
                style={{
                  position: 'relative',
                  width: `${pageDims.width * canvasScale}px`,
                  height: `${pageDims.height * canvasScale}px`,
                  cursor: pendingDataUrl ? 'crosshair' : 'default',
                  flexShrink: 0,
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

                {sigsOnPage.map((sig) => (
                  <SignatureOverlay
                    key={sig.id}
                    sig={sig}
                    selected={selectedSigId === sig.id}
                    onSelect={() => setSelectedSigId(sig.id)}
                    onChange={(next) => updateSignature(sig.id, next)}
                    onDelete={() => deleteSignature(sig.id)}
                    pageHeightPdf={pageDims.height}
                    canvasScale={canvasScale}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 space-y-3 text-slate-500">
                <Loader2 className="w-9 h-9 animate-spin text-indigo-500" />
                <p className="text-xs font-semibold">Preparing view…</p>
              </div>
            )}
          </div>

          {hasSigs && (
            <div className="shrink-0 lg:col-span-3 max-h-36 lg:max-h-none lg:min-h-0 flex flex-col overflow-hidden">
              <div className="bg-white border border-slate-200 rounded-2xl lg:rounded-3xl p-3 lg:p-4 shadow-sm flex flex-col overflow-hidden h-full">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    Placed ({signatures.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => { setSignatures([]); setSelectedSigId(null); }}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>
                <div className="space-y-1.5 overflow-y-auto pr-1 flex-1 min-h-0">
                  {signatures.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setCurrentPage(s.page); setSelectedSigId(s.id); }}
                      className={`w-full text-left p-2 rounded-xl border flex items-center gap-2 text-[11px] transition cursor-pointer ${
                        selectedSigId === s.id
                          ? 'border-indigo-400 bg-indigo-50'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <img
                        src={s.dataUrl}
                        alt=""
                        className="w-9 h-6 object-contain bg-white rounded border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">Signature {i + 1}</div>
                        <div className="text-slate-500 text-[10px]">Page {s.page}</div>
                      </div>
                      <span
                        onClick={(e) => { e.stopPropagation(); deleteSignature(s.id); }}
                        className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
                        role="button"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {pageDataUrl && !loading && (
        <div className="shrink-0 flex justify-center pb-2 sm:pb-3 px-2">
          <div className="bg-slate-900/95 backdrop-blur-md text-white px-2 sm:px-3 py-1.5 rounded-2xl flex items-center space-x-1.5 sm:space-x-2 text-xs shadow-xl max-w-full overflow-x-auto">
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
        </div>
      )}
    </div>
  );
}