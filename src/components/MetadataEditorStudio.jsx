import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle, Info,
  FileText, BookOpen, User, Hash, Building2, Calendar, Clock,
  X as CloseIcon, RotateCcw, Wand2, Copy, FileSignature, ShieldCheck,
  Upload, Save, BookMarked, Tag, Layers, Lock, Eye, EyeOff,
} from 'lucide-react';
import { readPdfMetadata, updatePdfMetadata, checkPdfPassword } from '../utils/pdfWorker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  const k = 1024;
  return bytes < k * k
    ? `${(bytes / k).toFixed(1)} KB`
    : `${(bytes / (k * k)).toFixed(2)} MB`;
}

function formatDateHuman(isoLocal) {
  if (!isoLocal) return '—';
  try {
    const d = new Date(isoLocal);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

// ---------------------------------------------------------------------------
// Reusable field
//
// When `showOriginal` is true, an inline "Was: <original>" line appears under
// the input so the user can compare current vs. original at a glance.
// ---------------------------------------------------------------------------
function MetadataField({
  icon: Icon, label, hint, placeholder, value, originalValue,
  onChange, type = 'text', maxLength, delayClass = '', showOriginal = false,
  isDate = false,
}) {
  const isChanged = (value || '') !== (originalValue || '');
  const hasValue = Boolean(value && value.length);
  const dateInput = isDate || type === 'datetime-local';

  return (
    <div className={`pf-anim-fade-up ${delayClass}`}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-500 min-w-0">
          <Icon className="w-3 h-3 shrink-0" />
          <span className="truncate">{label}</span>
        </label>
        {isChanged && (
          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 pf-anim-slide-down shrink-0">
            Changed
          </span>
        )}
      </div>

      <div className="relative">
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`w-full px-3.5 py-3 min-h-[44px] bg-white border rounded-2xl text-sm font-medium transition-all focus:outline-none pf-focus ${
            dateInput ? 'pr-12' : (hasValue ? 'pr-11' : '')
          } ${
            isChanged
              ? 'border-amber-300 ring-2 ring-amber-200/40 focus:border-amber-400'
              : 'border-slate-200 focus:border-cyan-400'
          }`}
        />
        {hasValue && (
          <button
            type="button"
            onClick={() => onChange('')}
            className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer ${
              dateInput ? 'right-9' : 'right-2'
            }`}
            title="Clear field"
            aria-label={`Clear ${label}`}
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Inline "Was: …" — only when Show originals is on */}
      {showOriginal && (
        <div className="mt-1.5 pf-anim-slide-down">
          <div className="flex items-start gap-1.5 text-[10.5px] leading-snug">
            <span className={`font-black uppercase tracking-wider shrink-0 ${
              isChanged ? 'text-amber-700' : 'text-slate-400'
            }`}>
              Was:
            </span>
            <span className={`truncate ${
              !originalValue
                ? 'text-slate-400 italic'
                : isChanged
                  ? 'text-amber-900 font-semibold'
                  : 'text-slate-500'
            }`}>
              {originalValue || 'empty'}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-1.5 gap-2">
        <p className="text-[10px] text-slate-400 leading-snug truncate">{hint}</p>
        {maxLength && (
          <p className={`text-[10px] tabular-nums font-mono shrink-0 ${
            value.length > maxLength * 0.9 ? 'text-amber-600' : 'text-slate-400'
          }`}>
            {value.length}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "What is metadata?" modal
// ---------------------------------------------------------------------------
function MetadataInfoModal({ onClose }) {
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

  const reasons = [
    { icon: User,      title: 'Remove personal info',  desc: 'Strip your name or company from files before sharing them publicly.' },
    { icon: BookMarked,title: 'Better searchability',  desc: 'Give the file a proper title so it appears correctly in search results and previews.' },
    { icon: Tag,       title: 'Add keywords',          desc: 'Tag documents for archival systems, DMS platforms, and internal search.' },
    { icon: Layers,    title: 'Fix wrong producer',    desc: 'Override the auto-detected "Creator" and "Producer" software stamps.' },
    { icon: Clock,     title: 'Correct dates',         desc: 'Set the original creation and modification dates when they are wrong.' },
    { icon: Lock,      title: '100% local',            desc: 'Everything happens in your browser. The file is never uploaded anywhere.' },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 pf-anim-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pf-anim-slide-up sm:pf-anim-scale-in bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">What is metadata?</h3>
              <p className="text-[11px] text-slate-500">Invisible info stored inside every PDF</p>
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
            Every PDF carries a small, invisible block of information about itself — its{' '}
            <span className="font-bold text-slate-800">title</span>,{' '}
            <span className="font-bold text-slate-800">author</span>,{' '}
            <span className="font-bold text-slate-800">subject</span>,{' '}
            <span className="font-bold text-slate-800">keywords</span>, and{' '}
            <span className="font-bold text-slate-800">creation dates</span>. Readers like
            Preview, Adobe Acrobat, and most browsers display these in their "Document
            Properties" or "Get Info" panel.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {reasons.map((r, i) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.title}
                  className={`pf-anim-fade-up pf-delay-${(i % 8) + 1} p-3 rounded-2xl border border-slate-200 bg-slate-50/60`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-black text-slate-900 leading-tight">
                        {r.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {r.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-cyan-50 via-white to-white border border-cyan-100 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-black text-slate-900">Stays on your device</p>
              <p className="text-[11.5px] text-slate-600 mt-0.5 leading-snug">
                Metadata is read and rewritten entirely in your browser. The PDF never
                touches a network connection.
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
// Animated info button
// ---------------------------------------------------------------------------
function AnimatedInfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="pf-anim-pulse-ring relative w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white flex items-center justify-center shadow-md shadow-cyan-500/30 transition-all cursor-pointer active:scale-95 shrink-0"
      title="What is metadata?"
      aria-label="Show metadata info"
    >
      <span
        className="absolute -inset-1 rounded-full pointer-events-none"
        style={{
          background: 'conic-gradient(from 0deg, rgba(34,211,238,0), rgba(34,211,238,0.6), rgba(34,211,238,0))',
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
// Studio
// ---------------------------------------------------------------------------
export default function MetadataEditorStudio({ tool, file, onBack }) {
  const [activeFile, setActiveFile] = useState(file);
  const newFileInputRef = useRef(null);

  const [original, setOriginal] = useState(null);
  const [draft, setDraft] = useState({
    title: '', author: '', subject: '', keywords: '',
    creator: '', producer: '', creationDate: '', modificationDate: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedNotice, setSavedNotice] = useState(null);
  const [result, setResult] = useState(null);
  const [showOriginals, setShowOriginals] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setErrorMsg('');
      setResult(null);
      try {
        if (!activeFile) {
          setErrorMsg('No file provided.');
          setIsLoading(false);
          return;
        }
        const meta = await readPdfMetadata(activeFile);
        if (cancelled) return;
        setOriginal(meta);
        setDraft({
          title: meta.title,
          author: meta.author,
          subject: meta.subject,
          keywords: meta.keywords,
          creator: meta.creator,
          producer: meta.producer,
          creationDate: meta.creationDate,
          modificationDate: meta.modificationDate,
        });
      } catch (err) {
        if (!cancelled) {
          console.error('Metadata read error:', err);
          setErrorMsg(err.message || 'Failed to read PDF metadata.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeFile]);

  const changedFields = useMemo(() => {
    if (!original) return [];
    const keys = ['title', 'author', 'subject', 'keywords', 'creator', 'producer', 'creationDate', 'modificationDate'];
    return keys.filter((k) => (draft[k] || '') !== (original[k] || ''));
  }, [draft, original]);

  const hasChanges = changedFields.length > 0;

  const updateField = (key) => (value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSavedNotice(null);
  };

  const resetAll = () => {
    if (!original) return;
    setDraft({
      title: original.title,
      author: original.author,
      subject: original.subject,
      keywords: original.keywords,
      creator: original.creator,
      producer: original.producer,
      creationDate: original.creationDate,
      modificationDate: original.modificationDate,
    });
    setSavedNotice(null);
  };

  const handleSave = async () => {
    if (!hasChanges) {
      setErrorMsg('Nothing to save — no fields were changed.');
      return;
    }
    setIsSaving(true);
    setErrorMsg('');
    setSavedNotice(null);
    try {
      const output = await updatePdfMetadata(activeFile, draft);
      const url = URL.createObjectURL(output.blob);
      setResult({
        url,
        filename: output.filename,
        originalSize: output.originalSize,
        compressedSize: output.compressedSize,
      });
      setOriginal({
        ...original,
        ...draft,
        modificationDate: draft.modificationDate || new Date().toISOString().slice(0, 16),
      });
      setSavedNotice({ count: changedFields.length });
      window.setTimeout(() => setSavedNotice(null), 5000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save metadata.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setSavedNotice(null);
    setErrorMsg('');
    setActiveFile(f);
  };

  const handleBack = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    onBack();
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <input
        type="file"
        ref={newFileInputRef}
        accept="application/pdf"
        className="hidden"
        onChange={handleNewFile}
      />

      {showInfoModal && <MetadataInfoModal onClose={() => setShowInfoModal(false)} />}

      <header className="sticky top-0 shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
          <button
            onClick={handleBack}
            className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-xs sm:text-sm px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Back</span>
          </button>

          <div className="flex items-center space-x-2 min-w-0 flex-1 justify-center">
            <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center shrink-0`}>
              {tool && <tool.icon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 leading-none truncate">
                Edit Metadata
              </h2>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[180px] sm:max-w-[260px]">
                {activeFile?.name}
              </p>
            </div>
            <AnimatedInfoButton onClick={() => setShowInfoModal(true)} />
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {hasChanges && !result && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold rounded-full pf-anim-slide-down">
                <Wand2 className="w-3 h-3" />
                {changedFields.length} change{changedFields.length === 1 ? '' : 's'}
              </span>
            )}

            {result && (
              <a
                href={result.url}
                download={result.filename}
                className="pf-anim-slide-down flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition cursor-pointer active:scale-[0.98]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </a>
            )}

            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges || isLoading}
              className="flex px-3 sm:px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm items-center space-x-1.5 transition cursor-pointer"
            >
              {isSaving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Saving…</span></>
              ) : (
                <><Save className="w-3.5 h-3.5" /><span>Save</span></>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 pb-28 sm:pb-6">
        {errorMsg && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-2.5 pf-anim-slide-down">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">{errorMsg}</p>
          </div>
        )}

        {savedNotice && (
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start space-x-2.5 pf-anim-slide-down">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">
              Saved {savedNotice.count} change{savedNotice.count === 1 ? '' : 's'}. Download the file from the panel.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
          {/* LEFT — FORM */}
          <div className="lg:col-span-8 order-2 lg:order-1">
            <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm">
              {/* Card header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Document properties
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Leave a field blank to remove it from the file.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowOriginals((v) => !v)}
                    aria-pressed={showOriginals}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                      showOriginals
                        ? 'bg-cyan-50 text-cyan-700 border-cyan-200 shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {showOriginals ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                    <span>{showOriginals ? 'Hide originals' : 'Show originals'}</span>
                  </button>

                  {hasChanges && (
                    <button
                      type="button"
                      onClick={resetAll}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset all</span>
                    </button>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="py-16 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                  <p className="text-xs font-semibold text-slate-500">Loading metadata…</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Identity */}
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-3">
                      Identity
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <MetadataField
                        icon={FileSignature}
                        label="Title"
                        value={draft.title}
                        originalValue={original?.title}
                        onChange={updateField('title')}
                        placeholder="e.g. Q3 Financial Report"
                        hint="Document title shown by readers"
                        maxLength={500}
                        delayClass="pf-delay-1"
                        showOriginal={showOriginals}
                      />
                      <MetadataField
                        icon={User}
                        label="Author"
                        value={draft.author}
                        originalValue={original?.author}
                        onChange={updateField('author')}
                        placeholder="e.g. Jane Doe"
                        hint="Person or organization that wrote it"
                        maxLength={500}
                        delayClass="pf-delay-2"
                        showOriginal={showOriginals}
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-3">
                      Description
                    </p>
                    <div className="space-y-4">
                      <MetadataField
                        icon={BookOpen}
                        label="Subject"
                        value={draft.subject}
                        originalValue={original?.subject}
                        onChange={updateField('subject')}
                        placeholder="Brief description of the document"
                        hint="One-line summary stored in the file"
                        maxLength={1000}
                        delayClass="pf-delay-3"
                        showOriginal={showOriginals}
                      />
                      <MetadataField
                        icon={Hash}
                        label="Keywords"
                        value={draft.keywords}
                        originalValue={original?.keywords}
                        onChange={updateField('keywords')}
                        placeholder="report, finance, q3, 2026"
                        hint="Comma-separated — preserved exactly as typed"
                        maxLength={500}
                        delayClass="pf-delay-4"
                        showOriginal={showOriginals}
                      />
                    </div>
                  </div>

                  {/* Provenance */}
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-3">
                      Provenance
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <MetadataField
                        icon={Building2}
                        label="Creator"
                        value={draft.creator}
                        originalValue={original?.creator}
                        onChange={updateField('creator')}
                        placeholder="e.g. Microsoft Word"
                        hint="Original authoring software"
                        maxLength={200}
                        delayClass="pf-delay-5"
                        showOriginal={showOriginals}
                      />
                      <MetadataField
                        icon={Copy}
                        label="Producer"
                        value={draft.producer}
                        originalValue={original?.producer}
                        onChange={updateField('producer')}
                        placeholder="e.g. Adobe Acrobat Distiller"
                        hint="PDF generation engine"
                        maxLength={200}
                        delayClass="pf-delay-6"
                        showOriginal={showOriginals}
                      />
                    </div>
                  </div>

                  {/* Dates */}
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-3">
                      Dates
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <MetadataField
                        icon={Calendar}
                        label="Creation date"
                        value={draft.creationDate}
                        originalValue={original?.creationDate}
                        onChange={updateField('creationDate')}
                        type="datetime-local"
                        isDate
                        hint={
                          draft.creationDate
                            ? formatDateHuman(draft.creationDate)
                            : 'When the document was originally created'
                        }
                        delayClass="pf-delay-7"
                        showOriginal={showOriginals}
                      />
                      <MetadataField
                        icon={Clock}
                        label="Modification date"
                        value={draft.modificationDate}
                        originalValue={original?.modificationDate}
                        onChange={updateField('modificationDate')}
                        type="datetime-local"
                        isDate
                        hint={
                          draft.modificationDate
                            ? formatDateHuman(draft.modificationDate)
                            : 'Defaults to now when saved'
                        }
                        delayClass="pf-delay-8"
                        showOriginal={showOriginals}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — DOC + RESULT */}
          <div className="lg:col-span-4 order-1 lg:order-2 space-y-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm pf-anim-fade-up">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Document
                  </p>
                  <p className="text-xs font-bold text-slate-800 truncate">
                    {activeFile?.name}
                  </p>
                </div>
              </div>

              {isLoading ? (
                <div className="py-4 flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
                  <p className="text-[10px] font-semibold text-slate-500">Reading…</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 bg-slate-50 rounded-xl">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                      Pages
                    </p>
                    <p className="text-sm font-bold text-slate-800">
                      {original?.pageCount ?? '—'}
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                      Size
                    </p>
                    <p className="text-sm font-bold text-slate-800">
                      {formatFileSize(original?.fileSize || activeFile?.size)}
                    </p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => newFileInputRef.current?.click()}
                className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] border border-dashed border-slate-300 hover:border-cyan-400 hover:bg-cyan-50/30 text-xs font-bold text-slate-600 hover:text-cyan-700 rounded-xl transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Choose different PDF</span>
              </button>
            </div>

            {result && (
              <div className="bg-white border border-emerald-200 rounded-3xl p-5 shadow-sm pf-anim-scale-in">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900">Ready to download</h3>
                    <p className="text-[10px] text-slate-500">Metadata applied</p>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] flex items-center justify-between mb-3">
                  <span className="text-slate-500 font-semibold truncate pr-2">
                    {result.filename}
                  </span>
                  <span className="text-emerald-700 font-bold shrink-0">
                    {formatFileSize(result.compressedSize)}
                  </span>
                </div>

                <a
                  href={result.url}
                  download={result.filename}
                  className="w-full py-3 min-h-[44px] bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-bold shadow-md shadow-cyan-600/20 flex items-center justify-center space-x-2 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile sticky action bar */}
      {!isLoading && (
        <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetAll}
              disabled={!hasChanges}
              className="flex-shrink-0 w-12 h-12 flex items-center justify-center border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 rounded-2xl transition cursor-pointer"
              title="Reset all changes"
              aria-label="Reset all changes"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {result && (
              <a
                href={result.url}
                download={result.filename}
                className="pf-anim-slide-up flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-bold shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="flex-1 h-12 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-sm font-bold shadow-md shadow-cyan-600/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving…</span></>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>
                    Save{hasChanges ? ` (${changedFields.length})` : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}