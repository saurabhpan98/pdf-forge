import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Pencil, X, Check, AlertCircle, SquareDashed } from 'lucide-react';

// ---------------------------------------------------------------------------
// PdfiumTextEditOverlay — tool-registration edition
//
// The annotation plugin requires an ACTIVE TOOL to create annotations.
// Tools are normally registered when the annotation toolbar mounts; if it
// isn't mounted, `getActiveTool()` returns undefined and `createAnnotation`
// throws "Cannot read properties of undefined (reading 'id')".
//
// This version:
//   • Logs the current tools on first attempt.
//   • Tries addTool() with several registration shapes if no freeText tool
//     exists.
//   • Falls back gracefully if the annotation can't be created — the
//     redaction still happened, so the text is genuinely gone. The user is
//     told to add the replacement via the toolbar's Text tool.
// ---------------------------------------------------------------------------

function rectFromPayload(rawRect) {
  if (!rawRect) return null;
  if (rawRect.origin && rawRect.size) {
    const x = rawRect.origin.x ?? 0;
    const y = rawRect.origin.y ?? 0;
    const width = rawRect.size.width ?? 0;
    const height = rawRect.size.height ?? 0;
    if (width > 0 && height > 0) return { x, y, width, height };
  }
  const x = rawRect.x ?? rawRect.left ?? rawRect.x0;
  const y = rawRect.y ?? rawRect.top ?? rawRect.y0;
  const w = rawRect.width ?? (typeof rawRect.x1 === 'number' && typeof x === 'number' ? rawRect.x1 - x : undefined);
  const h = rawRect.height ?? (typeof rawRect.y1 === 'number' && typeof y === 'number' ? rawRect.y1 - y : undefined);
  if (typeof x === 'number' && typeof y === 'number' && typeof w === 'number' && typeof h === 'number' && w > 1 && h > 1) {
    return { x, y, width: w, height: h };
  }
  return null;
}

function textFromAnyShape(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(textFromAnyShape).filter(Boolean).join(' ');
  if (typeof v === 'object') {
    for (const c of [v.text, v.contents, v.selectedText, v.value, v.string]) {
      if (typeof c === 'string' && c.trim()) return c;
    }
    for (const k of ['activeSelection', 'current', 'state', 'selection']) {
      if (v[k]) { const inner = textFromAnyShape(v[k]); if (inner) return inner; }
    }
  }
  return '';
}

const MODE_CANDIDATES = ['text', 'select', 'selection', 'text-select', 'textSelection', 'pointer', 'default', 'read', 'view'];

// Tool registration shape candidates. We try each until one of them
// produces an entry in getTools() whose id we can set as active.
const TOOL_REGISTRATION_SHAPES = [
  { id: 'freeText', type: 'freeText', name: 'Free Text' },
  { id: 'freeText', annotationType: 'freeText', label: 'Free Text' },
  { id: 'freeText', kind: 'freeText', title: 'Free Text' },
  { id: 'freeText', category: 'annotation', subtype: 'freeText' },
  { id: 'freeText' },
];

// Tool ids to set active if a tool already exists.
const FREETEXT_TOOL_ID_HINTS = ['freeText', 'freetext', 'FreeText', 'text', 'textBox', 'textbox'];

// Tool-id-like string extraction, tolerant of the many shapes EmbedPDF may
// return from getTools().
function toolIdOf(tool) {
  if (!tool) return null;
  if (typeof tool === 'string') return tool;
  return tool.id ?? tool.name ?? tool.toolId ?? tool.key ?? tool.type ?? null;
}

function isFreeTextTool(tool) {
  const id = String(toolIdOf(tool) || '').toLowerCase();
  const type = String(tool?.type ?? tool?.subtype ?? tool?.annotationType ?? '').toLowerCase();
  return (
    id.includes('freetext') || id.includes('free-text') ||
    id === 'text' || id === 'textbox' ||
    type.includes('freetext')
  );
}

export default function PdfiumTextEditOverlay({ registry, disabled = false }) {
  const [marquee, setMarquee] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dbg, setDbg] = useState({ mode: '-', mq: 0, end: 0, rect: '-', tool: '-' });

  const registryRef = useRef(registry);
  useEffect(() => { registryRef.current = registry; }, [registry]);

  const loggedToolsRef = useRef(false);

  const getSelGlobal = () => registryRef.current?.getPlugin?.('selection')?.provides?.() || null;
  const getRedGlobal = () => registryRef.current?.getPlugin?.('redaction')?.provides?.() || null;
  const getAnnGlobal = () => registryRef.current?.getPlugin?.('annotation')?.provides?.() || null;

  const scopeFor = async (globalApi, documentId) => {
    if (!globalApi) return null;
    if (typeof globalApi.forDocument !== 'function') return globalApi;
    try {
      const r = globalApi.forDocument(documentId);
      return r && typeof r.then === 'function' ? await r : r;
    } catch { return globalApi; }
  };

  // ---------------------------------------------------------------------------
  // Enable marquee.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!registry) return;
    const enable = () => {
      const api = getSelGlobal();
      if (!api) return false;
      if (typeof api.enableForMode === 'function') {
        for (const m of MODE_CANDIDATES) { try { api.enableForMode(m); } catch { /* ignore */ } }
      }
      let ok = false;
      if (typeof api.setMarqueeEnabled === 'function') {
        try { api.setMarqueeEnabled(true); ok = true; } catch { /* ignore */ }
      }
      if (ok) setDbg((d) => ({ ...d, mode: 'marquee-on' }));
      return ok;
    };
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      if (enable() || tries > 30) window.clearInterval(id);
    }, 200);
    enable();
    return () => window.clearInterval(id);
  }, [registry]);

  // ---------------------------------------------------------------------------
  // Marquee subscription.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!registry) return;
    let cancelled = false;
    const unsubscribers = [];

    const handleEnd = async (payload) => {
      if (cancelled || !payload) return;
      setDbg((d) => ({ ...d, end: d.end + 1 }));
      const documentId = payload.documentId || payload.docId || null;
      const pageIndex = payload.pageIndex ?? payload.page ?? 0;
      const rect = rectFromPayload(payload.rect || payload.bounds || payload);
      if (!rect) { setDbg((d) => ({ ...d, rect: 'no-rect' })); return; }
      setDbg((d) => ({ ...d, rect: `${Math.round(rect.width)}×${Math.round(rect.height)}` }));

      let text = '';
      try {
        const scoped = await scopeFor(getSelGlobal(), documentId);
        if (scoped?.getSelectedText) text = textFromAnyShape(scoped.getSelectedText()).trim();
        if (!text && scoped?.getFormattedSelection) text = textFromAnyShape(scoped.getFormattedSelection()).trim();
        if (!text && scoped?.getState) text = textFromAnyShape(scoped.getState()).trim();
      } catch { /* ignore */ }

      setMarquee({ documentId, pageIndex, rect, text });
    };

    const handleChange = () => { if (!cancelled) setDbg((d) => ({ ...d, mq: d.mq + 1 })); };

    const attach = () => {
      const api = getSelGlobal();
      if (!api) return false;
      if (typeof api.onMarqueeChange === 'function') { try { unsubscribers.push(api.onMarqueeChange(handleChange)); } catch { /* ignore */ } }
      if (typeof api.onMarqueeEnd === 'function') { try { unsubscribers.push(api.onMarqueeEnd(handleEnd)); } catch { /* ignore */ } }
      return unsubscribers.length > 0;
    };

    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      if (attach() || tries > 30) window.clearInterval(id);
    }, 200);
    attach();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      unsubscribers.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
    };
  }, [registry]);

  // ---------------------------------------------------------------------------
  // Ensure a freeText tool is registered and active. Returns its id or null.
  // ---------------------------------------------------------------------------
  const ensureFreeTextTool = useCallback(async (annApi) => {
    if (!annApi) return null;

    const readTools = () => {
      try { return annApi.getTools?.() || []; } catch { return []; }
    };

    // One-time diagnostic.
    if (!loggedToolsRef.current) {
      loggedToolsRef.current = true;
      const tools = readTools();
      console.log('[TextEdit] Available annotation tools:', tools);
      console.log(
        '[TextEdit] Tool ids:',
        Array.isArray(tools) ? tools.map(toolIdOf) : '(not an array)'
      );
      try {
        console.log('[TextEdit] Currently active tool:', annApi.getActiveTool?.());
      } catch { /* ignore */ }
    }

    // 1. Any existing freeText-like tool?
    let tools = readTools();
    let match = Array.isArray(tools) ? tools.find(isFreeTextTool) : null;

    // 2. If not, try to register one.
    if (!match && typeof annApi.addTool === 'function') {
      for (const shape of TOOL_REGISTRATION_SHAPES) {
        try {
          await annApi.addTool(shape);
          tools = readTools();
          match = Array.isArray(tools) ? tools.find(isFreeTextTool) : null;
          if (match) {
            console.log('[TextEdit] Registered freeText tool with shape:', shape);
            break;
          }
        } catch (e) {
          console.log('[TextEdit] addTool shape rejected:', shape, e?.message || e);
        }
      }
    }

    // 3. Set active.
    if (match) {
      const id = toolIdOf(match);
      try {
        annApi.setActiveTool?.(id);
        const active = annApi.getActiveTool?.();
        const activeId = toolIdOf(active);
        if (!activeId || activeId === id) {
          return id;
        }
      } catch { /* ignore */ }
      return id;
    }

    // 4. Last resort: brute-force setActiveTool with common ids.
    if (typeof annApi.setActiveTool === 'function') {
      for (const hint of FREETEXT_TOOL_ID_HINTS) {
        try {
          annApi.setActiveTool(hint);
          const active = annApi.getActiveTool?.();
          const activeId = toolIdOf(active);
          if (activeId === hint) return hint;
        } catch { /* try next */ }
      }
    }

    return null;
  }, []);

  // ---------------------------------------------------------------------------
  // Replace in place.
  // ---------------------------------------------------------------------------
  const handleReplace = useCallback(async () => {
    if (!marquee || busy) return;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const { documentId, pageIndex, rect, text: originalText } = marquee;

      const redApi = await scopeFor(getRedGlobal(), documentId);
      const annApi = await scopeFor(getAnnGlobal(), documentId);
      if (!redApi) throw new Error('Redaction plugin unavailable.');

      // ============================================================
      // 1. Queue redaction — array shape, as fixed previously.
      // ============================================================
      let queued = false;
      if (typeof redApi.queueCurrentSelectionAsPending === 'function') {
        try { await redApi.queueCurrentSelectionAsPending(); queued = true; } catch { /* fall through */ }
      }
      if (!queued && typeof redApi.addPending === 'function') {
        try { await redApi.addPending([{ pageIndex, rect }]); queued = true; } catch { /* fall through */ }
      }
      if (!queued && typeof redApi.addPendingItems === 'function') {
        try { await redApi.addPendingItems([{ pageIndex, rect }]); queued = true; } catch { /* fall through */ }
      }
      if (!queued) throw new Error('Could not queue redaction.');

      if (typeof redApi.commitAllPending === 'function') await redApi.commitAllPending();
      else if (typeof redApi.commitPending === 'function') await redApi.commitPending();

      // ============================================================
      // 2. Create annotation — with tool registration first.
      // ============================================================
      const toolId = await ensureFreeTextTool(annApi);
      setDbg((d) => ({ ...d, tool: toolId || 'none' }));
      console.log('[TextEdit] FreeText tool id resolved to:', toolId);

      let created = null;
      if (annApi && typeof annApi.createAnnotation === 'function') {
        const payloads = [
          {
            pageIndex, type: 'freeText', rect,
            contents: originalText, text: originalText,
            fontSize: 12, fontColor: '#000000', author: 'PDF Forge',
          },
          {
            pageIndex, type: 'freeText',
            rect: { origin: { x: rect.x, y: rect.y }, size: { width: rect.width, height: rect.height } },
            contents: originalText, fontSize: 12, fontColor: '#000000',
          },
          toolId && {
            toolId, pageIndex, type: 'freeText', rect,
            contents: originalText, fontSize: 12,
          },
          { annotation: { pageIndex, type: 'freeText', rect, contents: originalText, fontSize: 12 } },
        ].filter(Boolean);

        for (const p of payloads) {
          try {
            created = await annApi.createAnnotation(p);
            if (created) {
              console.log('[TextEdit] createAnnotation succeeded with payload shape:', Object.keys(p));
              break;
            }
          } catch (e) {
            console.log('[TextEdit] createAnnotation payload rejected:', Object.keys(p), e?.message || e);
          }
        }
      }

      // ============================================================
      // 3. Select newly created annotation (or show guidance).
      // ============================================================
      if (created) {
        const annId = created?.id ?? created?.uid ?? created?._id ?? created?.annotation?.id;
        if (annId && typeof annApi.selectAnnotation === 'function') {
          try { await annApi.selectAnnotation(annId); } catch { /* ignore */ }
        }
        setNotice('Text removed. Retype your replacement in the new text box.');
        setTimeout(() => setNotice(''), 6000);
      } else {
        // Redaction succeeded, annotation failed — the text is gone.
        // Guide the user to the toolbar's Text tool.
        setNotice(
          'Text was removed. Use the Text tool in the toolbar to add your replacement.'
        );
        setTimeout(() => setNotice(''), 10000);
      }

      const selGlobal = getSelGlobal();
      if (selGlobal?.clear) { try { await selGlobal.clear(); } catch { /* ignore */ } }
      setMarquee(null);
    } catch (err) {
      console.error('[TextEdit] Replace failed:', err);
      setError(err?.message || 'Replace failed.');
      setTimeout(() => setError(''), 10000);
    } finally {
      setBusy(false);
    }
  }, [marquee, busy, ensureFreeTextTool]);

  const clearMarquee = useCallback(() => setMarquee(null), []);

  return (
    <div id="pf-text-edit-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
      {/* Pill */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(6px)',
        color: '#fff', borderRadius: 10, padding: '6px 10px',
        fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontWeight: 600, pointerEvents: 'auto',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column', gap: 3, minWidth: 230,
        userSelect: 'none', WebkitUserSelect: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: marquee ? '#4ade80' : '#facc15', fontSize: 14, lineHeight: 1 }}>●</span>
          <span>Text Edit: {marquee ? 'ready' : 'idle'}</span>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
          mode <span style={{ color: dbg.mode === '-' ? '#f87171' : '#4ade80' }}>{dbg.mode}</span>
          {'  '}mq <span style={{ color: dbg.mq > 0 ? '#4ade80' : '#e2e8f0' }}>{dbg.mq}</span>
          {'  '}end <span style={{ color: dbg.end > 0 ? '#4ade80' : '#e2e8f0' }}>{dbg.end}</span>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
          rect <span style={{ color: dbg.rect === '-' || dbg.rect === 'no-rect' ? '#f87171' : '#4ade80' }}>{dbg.rect}</span>
          {'  '}tool <span style={{ color: dbg.tool === '-' || dbg.tool === 'none' ? '#f87171' : '#4ade80' }}>{dbg.tool}</span>
        </div>
      </div>

      {!marquee && !error && !notice && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(6px)',
          color: '#cbd5e1', borderRadius: 10, padding: '6px 12px',
          fontSize: 11, fontWeight: 500, pointerEvents: 'none',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', gap: 6,
          userSelect: 'none', WebkitUserSelect: 'none',
        }}>
          <SquareDashed size={12} color="#93c5fd" />
          <span>Drag a rectangle over text to replace it in place</span>
        </div>
      )}

      {marquee && !error && (
        <div style={{
          position: 'absolute', top: 90, right: 12,
          background: 'rgba(15,23,42,0.96)', backdropFilter: 'blur(6px)',
          color: '#fff', borderRadius: 12,
          padding: '6px 6px 6px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
          pointerEvents: 'auto', maxWidth: 480,
          userSelect: 'none', WebkitUserSelect: 'none',
        }}>
          <Pencil size={14} color="#93c5fd" />
          <span style={{ fontSize: 11, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {marquee.text
              ? (marquee.text.length > 40 ? `"${marquee.text.slice(0, 40)}…"` : `"${marquee.text}"`)
              : `Region on page ${marquee.pageIndex + 1} (${Math.round(marquee.rect.width)}×${Math.round(marquee.rect.height)})`}
          </span>
          <button
            type="button"
            onClick={handleReplace}
            disabled={busy || disabled}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: busy ? '#1d4ed8' : '#2563eb', color: '#fff',
              border: 'none', cursor: busy || disabled ? 'wait' : 'pointer',
            }}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            <span>{busy ? 'Replacing…' : 'Replace in place'}</span>
          </button>
          <button
            type="button"
            onClick={clearMarquee}
            title="Clear selection"
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {notice && !error && (
        <div style={{
          position: 'absolute', top: 90, right: 12,
          background: 'rgba(37,99,235,0.95)', color: '#fff',
          borderRadius: 10, padding: '8px 12px',
          fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
          pointerEvents: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
          maxWidth: 480, userSelect: 'none', WebkitUserSelect: 'none',
        }}>
          <Check size={14} />
          <span style={{ flex: 1 }}>{notice}</span>
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', top: 90, right: 12,
          background: '#e11d48', color: '#fff', borderRadius: 10,
          padding: '6px 10px', fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
          pointerEvents: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
          maxWidth: 480, userSelect: 'none', WebkitUserSelect: 'none',
        }}>
          <AlertCircle size={14} />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => setError('')}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}>
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}