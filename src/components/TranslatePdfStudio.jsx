// src/components/TranslatePdfStudio.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Loader2, Check, AlertCircle, Languages, FileText,
  Copy, RotateCcw, HardDrive, Download, ChevronDown, Eye, EyeOff,
  Upload, X, Info,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAIWorker } from '../hooks/useAIWorker';
import { checkPdfPassword } from '../utils/pdfWorker';
import AICacheManager from './AICacheManager';
import AIWorkingCard from './AIWorkingCard';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

const LANGUAGES = [
  { code: 'spa_Latn', name: 'Spanish' },
  { code: 'fra_Latn', name: 'French' },
  { code: 'deu_Latn', name: 'German' },
  { code: 'ita_Latn', name: 'Italian' },
  { code: 'por_Latn', name: 'Portuguese' },
  { code: 'nld_Latn', name: 'Dutch' },
  { code: 'pol_Latn', name: 'Polish' },
  { code: 'rus_Cyrl', name: 'Russian' },
  { code: 'hin_Deva', name: 'Hindi' },
  { code: 'ara_Arab', name: 'Arabic' },
  { code: 'jpn_Jpan', name: 'Japanese' },
  { code: 'kor_Hang', name: 'Korean' },
  { code: 'zho_Hans', name: 'Chinese (Simplified)' },
  { code: 'zho_Hant', name: 'Chinese (Traditional)' },
];

export default function TranslatePdfStudio({ tool, file, onBack }) {
  const { isReady, progress, error: workerError, postMessage, onMessage } = useAIWorker();

  const [activeFile, setActiveFile] = useState(file);
  const newFileInputRef = useRef(null);

  const [pdfText, setPdfText] = useState('');
  const [targetLang, setTargetLang] = useState('spa_Latn');
  const [sections, setSections] = useState([]);
  const [streaming, setStreaming] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cancelledNotice, setCancelledNotice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeDevice, setActiveDevice] = useState(null);
  const [phaseInfo, setPhaseInfo] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showCacheManager, setShowCacheManager] = useState(false);

  // ---- Extract PDF text ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setErrorMsg('');
      try {
        if (!activeFile) { setErrorMsg('No file provided.'); setIsLoading(false); return; }
        const isLocked = await checkPdfPassword(activeFile);
        if (isLocked) {
          if (!cancelled) {
            setErrorMsg(`"${activeFile.name}" is password-protected. Please unlock it first.`);
            setIsLoading(false);
          }
          return;
        }
        const arrayBuffer = await activeFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pageTexts = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          const lines = [];
          let currentY = null;
          let currentLine = '';
          for (const item of tc.items) {
            if (!item.str) continue;
            const y = item.transform[5];
            if (currentY === null) { currentY = y; currentLine = item.str; }
            else if (Math.abs(y - currentY) < 4) { currentLine += item.str; }
            else {
              if (currentLine.trim()) lines.push({ y: currentY, text: currentLine.trim() });
              currentY = y;
              currentLine = item.str;
            }
          }
          if (currentLine.trim()) lines.push({ y: currentY, text: currentLine.trim() });

          const paragraphs = [];
          let para = [];
          let lastY = null;
          for (const ln of lines) {
            if (lastY !== null && Math.abs(lastY - ln.y) > 18 && para.length) {
              paragraphs.push(para.join(' '));
              para = [];
            }
            para.push(ln.text);
            lastY = ln.y;
          }
          if (para.length) paragraphs.push(para.join(' '));
          pageTexts.push(paragraphs.join('\n\n'));
        }

        if (cancelled) return;
        const fullText = pageTexts.join('\n\n').trim();
        setPdfText(fullText);
        if (!fullText) setErrorMsg('No extractable text found — this PDF may be scanned.');
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setErrorMsg('Failed to read PDF. The file may be corrupted.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeFile]);

  // ---- Worker subscription ----
  useEffect(() => {
    const unsubscribe = onMessage((data) => {
      if (data.status === 'device-selected' && data.task === 'translate') {
        setActiveDevice(data.device);
      }
      if (data.status === 'progress' && data.task === 'translate') {
        setPhaseInfo(data);
      }
      if (data.status === 'partial' && data.task === 'translate') {
        setStreaming((prev) => {
          const next = prev.slice();
          next[data.index] = { source: data.source, translation: data.translation };
          return next;
        });
      }
      if (data.status === 'complete' && data.task === 'translate') {
        setSections(Array.isArray(data.output) ? data.output : []);
        setIsProcessing(false);
        setPhaseInfo(null);
        setStreaming([]);
      }
      if (data.status === 'cancelled' && data.task === 'translate') {
        // Preserve whatever partial translation we got
        if (Array.isArray(data.output) && data.output.length > 0) {
          setSections(data.output);
        }
        setIsProcessing(false);
        setPhaseInfo(null);
        setStreaming([]);
        setCancelledNotice(true);
        window.setTimeout(() => setCancelledNotice(false), 6000);
      }
      if (data.status === 'error') {
        setErrorMsg(data.error || 'Translation failed.');
        setIsProcessing(false);
        setPhaseInfo(null);
      }
    });
    return unsubscribe;
  }, [onMessage]);

  const handleTranslate = () => {
    if (!pdfText) return;
    setIsProcessing(true);
    setSections([]);
    setStreaming([]);
    setErrorMsg('');
    setPhaseInfo(null);
    setCancelledNotice(false);
    postMessage({
      type: 'translate',
      payload: { text: pdfText, src_lang: 'eng_Latn', tgt_lang: targetLang },
    });
  };

  const handleCancel = () => {
    postMessage({ type: 'cancel', payload: { task: 'translate' } });
    // Optimistic UI: keep partial sections already streamed in
    const partial = streaming.filter(Boolean);
    if (partial.length > 0) setSections(partial);
    setStreaming([]);
    setIsProcessing(false);
    setPhaseInfo(null);
    setCancelledNotice(true);
    window.setTimeout(() => setCancelledNotice(false), 6000);
  };

  const handleNewFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;

    if (isProcessing) {
      postMessage({ type: 'cancel', payload: { task: 'translate' } });
    }

    setIsProcessing(false);
    setPhaseInfo(null);
    setSections([]);
    setStreaming([]);
    setPdfText('');
    setErrorMsg('');
    setCancelledNotice(false);

    setActiveFile(f);
  };

  const handleCopy = async () => {
    try {
      const full = sections.map((s) => s.translation).join('\n\n');
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleDownload = () => {
    const full = sections.map((s) => s.translation).join('\n\n');
    const blob = new Blob([full], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeFile?.name || 'document').replace(/\.[^/.]+$/, '')}_${targetLang.split('_')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displaySections = useMemo(() => {
    if (isProcessing) return streaming.filter(Boolean);
    return sections;
  }, [isProcessing, sections, streaming]);

  const isDownloading = progress && progress.phase === 'download';
  const langLabel = LANGUAGES.find((l) => l.code === targetLang)?.name || targetLang;

  return (
    <div className="bg-slate-50 h-screen flex flex-col overflow-hidden">
      <input
        type="file"
        ref={newFileInputRef}
        accept="application/pdf"
        className="hidden"
        onChange={handleNewFile}
      />

      <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-sm px-3 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-lg ${tool.bg} ${tool.color} flex items-center justify-center`}>
              <Languages className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Translate PDF</h2>
            {activeDevice && (
              <span
                className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                  activeDevice === 'webgpu'
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-100 text-amber-700 border border-amber-200'
                }`}
              >
                {activeDevice === 'webgpu' ? 'GPU' : 'CPU'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isProcessing && (
              <button
                onClick={handleCancel}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>
            )}
            <button
              onClick={() => setShowCacheManager(true)}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition cursor-pointer"
              title="Manage AI model storage"
            >
              <HardDrive className="w-4 h-4" />
            </button>
            <div className="w-10" />
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5 overflow-y-auto">
        {errorMsg && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">{errorMsg}</p>
          </div>
        )}

        {cancelledNotice && (
          <div className="pf-anim-slide-down p-3 bg-slate-100 border border-slate-200 rounded-2xl text-xs text-slate-700 flex items-start space-x-2.5">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">
              Translation stopped. {sections.length > 0 ? `Showing the ${sections.length} section${sections.length === 1 ? '' : 's'} that finished.` : ''} You can translate again or upload a different PDF.
            </p>
          </div>
        )}

        {/* Document card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center space-x-2 mb-3 pb-3 border-b border-slate-100">
            <FileText className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-xs font-bold text-slate-700 truncate">{activeFile?.name}</span>
            <span className="text-[10px] text-slate-400 shrink-0">
              {pdfText.length.toLocaleString()} chars
            </span>
            <button
              onClick={() => newFileInputRef.current?.click()}
              disabled={isLoading}
              className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Upload className="w-3 h-3" />
              <span>New PDF</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed italic">
            {pdfText ? pdfText.substring(0, 260) + '…' : (isLoading ? 'Reading document…' : 'No text extracted yet.')}
          </p>
        </div>

        {/* Language selector */}
        {displaySections.length === 0 && !isProcessing && !isLoading && pdfText && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                Target language
              </label>
              <div className="relative">
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition appearance-none cursor-pointer pr-10"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <button
              onClick={handleTranslate}
              disabled={!isReady}
              className="w-full py-4 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/25 transition flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99]"
            >
              <Languages className="w-5 h-5" />
              <span>Translate to {langLabel}</span>
            </button>
          </div>
        )}

        {/* AI working card */}
        {(isProcessing || isDownloading) && (
          <AIWorkingCard
            task="translate"
            device={activeDevice}
            progress={progress}
            phaseInfo={phaseInfo}
            charCount={pdfText.length}
            onCancel={handleCancel}
          />
        )}

        {/* Output */}
        {displaySections.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center space-x-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  isProcessing ? 'bg-indigo-100' : 'bg-emerald-100'
                }`}>
                  {isProcessing
                    ? <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                    : <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {langLabel} Translation
                  <span className="text-slate-400 font-normal ml-1.5">
                    · {displaySections.length} section{displaySections.length === 1 ? '' : 's'}
                    {!isProcessing && cancelledNotice ? ' (partial)' : ''}
                  </span>
                </h3>
              </div>
              {!isProcessing && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowOriginal((v) => !v)}
                    className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                    title={showOriginal ? 'Hide source' : 'Show source'}
                  >
                    {showOriginal ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span className="hidden sm:inline">{showOriginal ? 'Hide source' : 'Show source'}</span>
                  </button>
                  <button
                    onClick={handleCopy}
                    className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={handleDownload}
                    className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>.txt</span>
                  </button>
                </div>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {displaySections.map((s, i) => (
                <div key={i} className="px-5 sm:px-7 py-5 space-y-3">
                  {showOriginal && s.source && (
                    <div className="pb-2 border-b border-dashed border-slate-200">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                        Original
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed italic">
                        {s.source}
                      </p>
                    </div>
                  )}
                  <p className="text-[13.5px] sm:text-[15px] leading-[1.75] text-slate-800">
                    {s.translation}
                  </p>
                </div>
              ))}
            </div>

            {!isProcessing && (
              <div className="px-5 sm:px-6 py-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={handleTranslate}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Re-translate</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {showCacheManager && (
        <AICacheManager onClose={() => setShowCacheManager(false)} />
      )}
    </div>
  );
}