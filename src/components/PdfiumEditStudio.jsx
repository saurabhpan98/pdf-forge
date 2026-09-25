import React, { useRef, useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowLeft, Loader2, Download, Check, AlertCircle,
  FileImage, Save, Undo2, Redo2,
} from 'lucide-react';
import { PDFViewer } from '@embedpdf/react-pdf-viewer';
import { checkPdfPassword } from '../utils/pdfWorker';

// ---------------------------------------------------------------------------
// PdfiumEditStudio
//
// A full PDFium-backed editing surface. Replaces the previous span-overlay
// editor with real PDFium rendering + real annotations + real redaction.
//
// The viewer is fed the file as a Blob URL. Password-protected files are
// detected up-front (via the same checkPdfPassword helper the rest of the
// app uses) and the user is asked to unlock the file first using the existing
// Unlock PDF tool.
//
// The "Save & Download" button calls the export plugin through the viewer
// registry, so every change the user made — annotations, redactions, form
// fields — is written into the returned PDF.
// ---------------------------------------------------------------------------
export default function PdfiumEditStudio({ tool, file, onBack }) {
  const viewerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [blobUrl, setBlobUrl] = useState('');
  const [registry, setRegistry] = useState(null);

  // -------------------------------------------------------------------------
  // Step 1: validate the file, create a Blob URL for the viewer.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let createdUrl = '';

    (async () => {
      try {
        setLoading(true);
        setLoadFailed(false);
        setErrorMsg('');

        if (!file) {
          setLoadFailed(true);
          setLoading(false);
          return;
        }

        // Password check — matches every other tool in the app.
        const isLocked = await checkPdfPassword(file);
        if (isLocked) {
          if (!cancelled) {
            setErrorMsg(
              `"${file.name}" is password-protected. Please unlock it first using the Unlock PDF tool.`
            );
            setLoadFailed(true);
            setLoading(false);
          }
          return;
        }

        // Feed the file as a Blob URL. EmbedPDF accepts a string URL and
        // fetches it internally via the PDFium WASM engine.
        createdUrl = URL.createObjectURL(file);
        if (cancelled) {
          URL.revokeObjectURL(createdUrl);
          return;
        }
        setBlobUrl(createdUrl);
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfiumEditStudio] load error:', err);
          setErrorMsg('Failed to prepare document for editing.');
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

  // -------------------------------------------------------------------------
  // Step 2: capture the viewer registry once the engine is ready.
  // -------------------------------------------------------------------------
  const handleReady = useCallback((reg) => {
    setRegistry(reg);
  }, []);

  // -------------------------------------------------------------------------
  // Step 3: save — asks the export plugin for the edited bytes.
  // -------------------------------------------------------------------------
  const handleSave = async () => {
    if (!registry) {
      setErrorMsg('Editor is still initialising. Please wait a moment.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      // The export plugin writes all annotations, redactions, and form
      // edits into a fresh PDF buffer.
      const exportPlugin = registry.getPlugin('export');
      if (!exportPlugin) {
        throw new Error('Export plugin is not available in this build.');
      }

      const api = exportPlugin.provides();
      // EmbedPDF's saveAsCopy() returns a Task; awaiting the task's
      // `toPromise()` gives us the ArrayBuffer.
      const task = api.saveAsCopy();
      const arrayBuffer = await (task.toPromise ? task.toPromise() : task);

      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const filename = `${baseName}_edited.pdf`;
      const url = URL.createObjectURL(blob);

      setResult({
        url,
        filename,
        originalSize: file.size,
        compressedSize: blob.size,
      });
    } catch (err) {
      console.error('[PdfiumEditStudio] save error:', err);
      setErrorMsg(err?.message || 'Failed to save edited PDF.');
    } finally {
      setSaving(false);
    }
  };

  const handleContinueEditing = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  };

  const handleBack = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    onBack();
  };

  // -------------------------------------------------------------------------
  // Result screen
  // -------------------------------------------------------------------------
  if (result) {
    return (
      <div className="bg-slate-50 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-sm px-3 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </button>
            <div className="flex items-center space-x-2">
              <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center`}>
                <tool.icon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">Edit PDF — Done</h2>
            </div>
            <div className="w-20" />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="bg-white border border-slate-200 rounded-3xl p-10 max-w-md w-full text-center space-y-6 shadow-md">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-black text-slate-900">PDF Updated Successfully</h3>
            <p className="text-xs text-slate-500 truncate">
              Generated file: <strong className="text-slate-800">{result.filename}</strong>
            </p>
            <div className="flex flex-col gap-3 pt-1">
              <a
                href={result.url}
                download={result.filename}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-md shadow-rose-600/20 flex items-center justify-center space-x-2 transition"
              >
                <Download className="w-4 h-4" />
                <span>Download Edited PDF</span>
              </a>
              <button
                onClick={handleContinueEditing}
                className="w-full py-3 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-bold transition cursor-pointer flex items-center justify-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>Continue Editing</span>
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

  // -------------------------------------------------------------------------
  // Editor
  // -------------------------------------------------------------------------
  return (
    <div className="bg-slate-50 h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button
            onClick={handleBack}
            className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-xs sm:text-sm px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>

          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center`}>
              {tool && <tool.icon className="w-4 h-4" />}
            </div>
            <div className="hidden sm:block">
              <h2 className="text-sm font-bold text-slate-900 leading-none">Edit PDF</h2>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[220px]">
                {file?.name}
              </p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !registry}
            className="px-3 sm:px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Save &amp; Download</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {errorMsg && (
        <div className="shrink-0 mx-3 sm:mx-4 mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="flex-1 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Viewer */}
      <main className="flex-1 min-h-0 px-3 sm:px-4 py-3">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-500">
            <Loader2 className="w-9 h-9 animate-spin text-rose-500" />
            <p className="text-xs font-semibold">Preparing editor…</p>
          </div>
        ) : loadFailed ? (
          <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-500">
            <FileImage className="w-10 h-10 text-slate-400" />
            <p className="text-xs font-semibold">
              Unable to open this document for editing.
            </p>
          </div>
                ) : blobUrl ? (
          <div className="relative h-full w-full rounded-2xl overflow-hidden border border-slate-200 bg-white">
            <PDFViewer
              ref={viewerRef}
              style={{ height: '100%', width: '100%' }}
              onReady={handleReady}
              config={{
                src: blobUrl,
                theme: { preference: 'light' },
                annotations: {
                  annotationAuthor: 'PDF Forge',
                },
                disabledCategories: ['print'],
              }}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}