// src/components/AISummarizerStudio.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Loader2, Check, AlertCircle, Sparkles, FileText,
  Copy, RotateCcw, HardDrive, Download, Clock, Hash, Zap, Search, BookOpen,
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

const MODES = [
  { id: 'brief',    label: 'Quick',    icon: Zap,      desc: '~100 words' },
  { id: 'standard', label: 'Standard', icon: Sparkles, desc: '~250 words' },
  { id: 'detailed', label: 'Deep',     icon: BookOpen, desc: '~500 words' },
];

function reflowParagraphs(text) {
  if (!text) return [];
  const sentences = text
    .replace(/([.!?])\s+(?=[A-Z"'\u201C\u2018(\[])/g, '$1\u0001')
    .split('\u0001')
    .map((s) => s.trim())
    .filter(Boolean);
  const paras = [];
  let buf = [];
  for (const s of sentences) {
    buf.push(s);
    if (buf.length >= 4) { paras.push(buf.join(' ')); buf = []; }
  }
  if (buf.length) paras.push(buf.join(' '));
  return paras;
}

export default function AISummarizerStudio({ tool, file, onBack }) {
  const { isReady, progress, error: workerError, postMessage, onMessage } = useAIWorker();

  // Local file (allows replacing the original via the New PDF button)
  const [activeFile, setActiveFile] = useState(file);
  const newFileInputRef = useRef(null);

  const [pdfText, setPdfText] = useState('');
  const [summary, setSummary] = useState('');
  const [mode, setMode] = useState('standard');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cancelledNotice, setCancelledNotice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeDevice, setActiveDevice] = useState(null);
  const [phaseInfo, setPhaseInfo] = useState(null);
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

  // ---- Worker message subscription ----
  useEffect(() => {
    const unsubscribe = onMessage((data) => {
      if (data.status === 'device-selected' && data.task === 'summarize') {
        setActiveDevice(data.device);
      }
      if (data.status === 'progress' && data.task === 'summarize') {
        setPhaseInfo(data);
      }
      if (data.status === 'complete' && data.task === 'summarize') {
        setSummary(typeof data.output === 'string' ? data.output : String(data.output || ''));
        setIsProcessing(false);
        setPhaseInfo(null);
      }
      if (data.status === 'cancelled' && data.task === 'summarize') {
        setIsProcessing(false);
        setPhaseInfo(null);
        setCancelledNotice(true);
        window.setTimeout(() => setCancelledNotice(false), 5000);
      }
      if (data.status === 'error') {
        setErrorMsg(data.error || 'Summarization failed.');
        setIsProcessing(false);
        setPhaseInfo(null);
      }
    });
    return unsubscribe;
  }, [onMessage]);

  const handleSummarize = () => {
    if (!pdfText) return;
    setIsProcessing(true);
    setSummary('');
    setErrorMsg('');
    setPhaseInfo(null);
    setCancelledNotice(false);
    postMessage({ type: 'summarize', payload: { text: pdfText, mode } });
  };

  const handleCancel = () => {
    postMessage({ type: 'cancel', payload: { task: 'summarize' } });
    // Optimistic UI: flip state immediately; worker will confirm with 'cancelled'
    setIsProcessing(false);
    setPhaseInfo(null);
    setCancelledNotice(true);
    window.setTimeout(() => setCancelledNotice(false), 5000);
  };

  const handleNewFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;

    // If something is running, cancel it first
    if (isProcessing) {
      postMessage({ type: 'cancel', payload: { task: 'summarize' } });
    }

    // Reset everything for the new file
    setIsProcessing(false);
    setPhaseInfo(null);
    setSummary('');
    setPdfText('');
    setErrorMsg('');
    setCancelledNotice(false);
    setMode('standard');

    setActiveFile(f);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleDownload = () => {
    const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeFile?.name || 'document').replace(/\.[^/.]+$/, '')}_summary.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summaryParagraphs = useMemo(() => reflowParagraphs(summary), [summary]);
  const wordCount = summary ? summary.trim().split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.round(wordCount / 200));
  const isDownloading = progress && progress.phase === 'download';

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
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">AI Summarizer</h2>
            {activeDevice && (
              <span
                className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                  activeDevice === 'webgpu'
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-100 text-amber-700 border border-amber-200'
                }`}
                title={activeDevice === 'webgpu' ? 'Running on GPU — fast' : 'Running on CPU — slower'}
              >
                {activeDevice === 'webgpu' ? 'GPU' : 'CPU'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isProcessing && (
              <button
                onClick={handleCancel}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
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
              Summarization stopped. You can adjust settings and try again, or upload a different PDF.
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
              className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Upload className="w-3 h-3" />
              <span>New PDF</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed italic">
            {pdfText ? pdfText.substring(0, 260) + '…' : (isLoading ? 'Reading document…' : 'No text extracted yet.')}
          </p>
        </div>

        {/* Mode selector */}
        {!summary && !isProcessing && !isLoading && pdfText && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                Summary depth
              </label>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                        active
                          ? 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${active ? 'text-rose-600' : 'text-slate-500'}`} />
                        <span className={`text-xs font-black ${active ? 'text-rose-700' : 'text-slate-800'}`}>
                          {m.label}
                        </span>
                      </div>
                      <p className={`text-[10px] ${active ? 'text-rose-700/80' : 'text-slate-500'}`}>
                        {m.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleSummarize}
              disabled={!isReady}
              className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-rose-500/25 transition flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99]"
            >
              <Sparkles className="w-5 h-5" />
              <span>Generate Summary</span>
            </button>
          </div>
        )}

        {/* AI working card */}
        {(isProcessing || isDownloading) && (
          <AIWorkingCard
            task="summarize"
            device={activeDevice}
            progress={progress}
            phaseInfo={phaseInfo}
            charCount={pdfText.length}
            onCancel={handleCancel}
          />
        )}

        {/* Output */}
        {summary && (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Summary</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="text-[10px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="text-[10px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>.txt</span>
                </button>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-4 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1">
                <Hash className="w-3 h-3" />
                {wordCount} words
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {readingTime} min read
              </span>
              <span className="flex items-center gap-1 ml-auto text-indigo-600">
                <Search className="w-3 h-3" />
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </span>
            </div>

            <div className="px-5 sm:px-7 py-5 sm:py-6 space-y-4">
              {summaryParagraphs.map((p, i) => (
                <p key={i} className="text-[13.5px] sm:text-[15px] leading-[1.75] text-slate-700">
                  {p}
                </p>
              ))}
            </div>

            <div className="px-5 sm:px-6 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleSummarize}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Regenerate</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {showCacheManager && (
        <AICacheManager onClose={() => setShowCacheManager(false)} />
      )}
    </div>
  );
}