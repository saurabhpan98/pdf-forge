// src/components/AISummarizerStudio.jsx
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Download, Check, AlertCircle, Sparkles, FileText, Copy, RotateCcw, ChevronDown } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAIWorker } from '../hooks/useAIWorker';
import { checkPdfPassword } from '../utils/pdfWorker';
import { HardDrive } from 'lucide-react';           // add HardDrive to the lucide import
import AICacheManager from './AICacheManager';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export default function AISummarizerStudio({ tool, file, onBack }) {
    const { isReady, progress, error: workerError, postMessage, onMessage } = useAIWorker();
    const [pdfText, setPdfText] = useState('');
    const [summary, setSummary] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [copied, setCopied] = useState(false);
    const [activeDevice, setActiveDevice] = useState(null);
    const [showCacheManager, setShowCacheManager] = useState(false);

    // Load and extract text from PDF
    useEffect(() => {
        (async () => {
            setIsLoading(true);
            setErrorMsg('');
            try {
                if (!file) { setErrorMsg('No file provided.'); setIsLoading(false); return; }
                const isLocked = await checkPdfPassword(file);
                if (isLocked) { setErrorMsg(`"${file.name}" is password-protected. Please unlock it first.`); setIsLoading(false); return; }
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let text = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map(item => item.str).join(' ') + '\n\n';
                }
                setPdfText(text.trim());
                if (!text.trim()) {
                    setErrorMsg('No extractable text found in this PDF. It may be a scanned document.');
                }
            } catch (err) {
                console.error(err);
                setErrorMsg('Failed to read PDF. The file may be corrupted.');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [file]);

        // Listen for summary completion via the hook's subscription (Worker messages
    // do NOT fire window events — this is the correct way to receive them).
    useEffect(() => {
        const unsubscribe = onMessage((data) => {
            if (data.status === 'device-selected' && data.task === 'summarize') {
                setActiveDevice(data.device);
            }
            if (data.status === 'complete' && data.task === 'summarize') {
                // Transformers.js returns an array for summarization
                const out = Array.isArray(data.output) ? data.output[0] : data.output;
                setSummary(out?.summary_text || out?.generated_text || String(out));
                setIsProcessing(false);
            }
            if (data.status === 'error') {
                setErrorMsg(data.error || 'Summarization failed.');
                setIsProcessing(false);
            }
        });
        return unsubscribe;
    }, [onMessage]);

    const handleSummarize = () => {
        if (!pdfText) return;
        setIsProcessing(true);
        setSummary('');
        setErrorMsg('');
        postMessage({
            type: 'summarize',
            payload: { text: pdfText.substring(0, 4000) } // Limit text to avoid OOM
        });
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(summary);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleBack = () => onBack();

    const loadingPercent = progress?.progress ? Math.round(progress.progress * 100) : 0;

    return (
        <div className="bg-slate-50 h-screen flex flex-col overflow-hidden">
            <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-30">
                <div className="max-w-4xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between">
                    <button onClick={handleBack} className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-semibold text-sm px-3 py-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
                        <ArrowLeft className="w-4 h-4" /><span>Back</span>
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
                                title={
                                    activeDevice === 'webgpu'
                                        ? 'Running on your GPU — fast'
                                        : 'Running on CPU — works everywhere but slower'
                                }
                            >
                                {activeDevice === 'webgpu' ? 'GPU' : 'CPU'}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setShowCacheManager(true)}
                            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition cursor-pointer"
                            title="Manage AI model storage"
                        >
                            <HardDrive className="w-4 h-4" />
                        </button>
                        <div className="w-16" />
                    </div>
                    <div className="w-20" />
                </div>
            </header>

            <main className="flex-1 min-h-0 max-w-4xl mx-auto w-full px-4 py-6 space-y-5 overflow-y-auto">
                {errorMsg && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="flex-1 font-medium">{errorMsg}</p>
                    </div>
                )}

                {/* Document Preview */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                    <div className="flex items-center space-x-2 mb-3 pb-3 border-b border-slate-100">
                        <FileText className="w-4 h-4 text-slate-500" />
                        <span className="text-xs font-bold text-slate-700 truncate">{file?.name}</span>
                        <span className="text-[10px] text-slate-400 ml-auto">{pdfText.length.toLocaleString()} chars</span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed italic">
                        {pdfText.substring(0, 300)}...
                    </p>
                </div>

                {/* Model Loading Progress */}
                {progress && (
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-2">
                        <div className="flex justify-between text-xs font-bold text-indigo-900">
                            <span>{progress.status === 'progress' ? 'Downloading AI model...' : 'Processing...'}</span>
                            <span>{loadingPercent}%</span>
                        </div>
                        <div className="w-full bg-indigo-200/50 rounded-full h-2 overflow-hidden">
                            <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${loadingPercent}%` }} />
                        </div>
                        <p className="text-[10px] text-indigo-600">{progress.file || 'Loading model files...'}</p>
                    </div>
                )}

                {/* Action Button */}
                {!summary && !isProcessing && !isLoading && (
                    <button
                        onClick={handleSummarize}
                        disabled={!pdfText || !isReady}
                        className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-rose-500/20 transition flex items-center justify-center space-x-2 cursor-pointer"
                    >
                        <Sparkles className="w-5 h-5" />
                        <span>Generate Summary</span>
                    </button>
                )}

                {isProcessing && !summary && (
                    <div className="text-center py-8 space-y-3">
                        <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto" />
                        <p className="text-xs font-bold text-slate-600">Analyzing document...</p>
                        <p className="text-[10px] text-slate-400">This may take a moment on first run</p>
                    </div>
                )}

                {/* Summary Output */}
                {summary && (
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-900">Summary</h3>
                            </div>
                            <button onClick={handleCopy} className="text-[10px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer">
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                <span>{copied ? 'Copied!' : 'Copy'}</span>
                            </button>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{summary}</p>
                        <button onClick={handleSummarize} className="text-[10px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer">
                            <RotateCcw className="w-3 h-3" /><span>Regenerate</span>
                        </button>
                    </div>
                )}
            </main>

            {showCacheManager && (
                <AICacheManager
                    onClose={() => setShowCacheManager(false)}
                    onCleared={() => { /* optional: show a toast */ }}
                />
            )}
        </div>
    );
}