import React, { useState } from 'react';
import { UploadCloud, X, AlertCircle, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import {
  checkPdfPassword,
  checkDocxPassword,
  checkPptxPassword,
  checkExcelPassword,
} from '../utils/pdfWorker';

export default function ToolModal({ tool, onClose, onLaunchStudio }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockedFiles, setLockedFiles] = useState([]);
  const [htmlMode, setHtmlMode] = useState('file');
  const [rawHtml, setRawHtml] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const getFileInputAccept = () => {
    if (tool.id === 'jpg-to-pdf') return 'image/jpeg,image/png,image/webp';
    if (tool.id === 'word-to-pdf') return '.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword';
    if (tool.id === 'powerpoint-to-pdf') return '.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint';
    if (tool.id === 'excel-to-pdf') return '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    if (tool.id === 'html-to-pdf') return '.html,.htm,text/html';
    return 'application/pdf';
  };

  const handleFilesSelected = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg('');
    setLockedFiles([]);
    setIsVerifying(true);

    const newFilesArray = Array.from(fileList);
    const lockedNames = [];

    try {
      for (const file of newFilesArray) {
        let isLocked = false;
        if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
          isLocked = await checkPdfPassword(file);
        } else if (tool.id === 'word-to-pdf') {
          isLocked = await checkDocxPassword(file);
        } else if (tool.id === 'powerpoint-to-pdf') {
          isLocked = await checkPptxPassword(file);
        } else if (tool.id === 'excel-to-pdf') {
          isLocked = await checkExcelPassword(file);
        }

        if (isLocked) lockedNames.push(file.name);
      }

      if (tool.id === 'protect' && lockedNames.length > 0) {
        setErrorMsg(`Cannot process: "${lockedNames[0]}" is already password-protected. Please choose an unprotected PDF.`);
        setIsVerifying(false);
        return;
      }

      if (tool.id === 'unlock') {
        if (lockedNames.length === 0) {
          setErrorMsg(`"${newFilesArray[0].name}" is already unlocked and does not require a password.`);
          setIsVerifying(false);
          return;
        }
        onLaunchStudio(tool, { files: newFilesArray, isLocked: true });
        return;
      }

      if (tool.id !== 'unlock' && lockedNames.length > 0) {
        setLockedFiles(lockedNames);
        setErrorMsg(
          lockedNames.length === 1
            ? `Cannot process: "${lockedNames[0]}" is password-protected or encrypted. Please select a non-protected file.`
            : `Cannot process: The selected files are password-protected. Please upload unprotected documents.`
        );
        setIsVerifying(false);
        return;
      }

      if (tool.id === 'jpg-to-pdf') {
        const imageCards = newFilesArray.map((file) => ({
          id: `img-${Date.now()}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          rotation: 0,
        }));
        onLaunchStudio(tool, { files: newFilesArray, imageCards });
        return;
      }

      onLaunchStudio(tool, { files: newFilesArray });
    } catch (err) {
      setErrorMsg('Failed to read file. Please ensure the document is not corrupted.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleHtmlCodeSubmit = () => {
    if (!rawHtml.trim()) {
      setErrorMsg('Please paste HTML code.');
      return;
    }
    onLaunchStudio(tool, { htmlCode: rawHtml, htmlMode: 'code' });
  };

  const Icon = tool.icon;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 pf-anim-fade-in">
      <div className="pf-anim-slide-up sm:pf-anim-scale-in bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl border border-slate-100 relative max-h-[95vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className={`w-11 h-11 rounded-2xl ${tool.bg} ${tool.color} flex items-center justify-center shadow-sm`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">{tool.name}</h3>
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              <span>Security-verified upload</span>
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 leading-relaxed pf-anim-slide-down">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Notice</p>
                <p className="mt-1">{errorMsg}</p>
              </div>
            </div>
          </div>
        )}

        {tool.id === 'html-to-pdf' && (
          <div className="flex border-b border-slate-100 mb-4 pb-1 space-x-5 text-xs font-bold">
            <button
              onClick={() => { setHtmlMode('file'); setErrorMsg(''); }}
              className={`pb-2 border-b-2 transition cursor-pointer ${htmlMode === 'file' ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
            >
              Upload .HTML File
            </button>
            <button
              onClick={() => { setHtmlMode('code'); setErrorMsg(''); }}
              className={`pb-2 border-b-2 transition cursor-pointer ${htmlMode === 'code' ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
            >
              Paste HTML Code
            </button>
          </div>
        )}

        {tool.id === 'html-to-pdf' && htmlMode === 'code' ? (
          <div className="space-y-4">
            <textarea
              rows="8"
              value={rawHtml}
              onChange={(e) => setRawHtml(e.target.value)}
              placeholder="<!DOCTYPE html><html><body><h1>Hello World</h1></body></html>"
              className="w-full font-mono text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 transition pf-focus"
            />
            <button
              onClick={handleHtmlCodeSubmit}
              className="w-full py-3.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white rounded-2xl font-bold transition flex items-center justify-center space-x-2 shadow-lg shadow-rose-500/30 cursor-pointer active:scale-[0.98]"
            >
              <span>Continue to Studio</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFilesSelected(e.dataTransfer.files);
            }}
            className={`relative rounded-3xl p-1 transition-all ${
              dragOver
                ? 'bg-gradient-to-br from-rose-500 to-indigo-500'
                : 'bg-transparent'
            }`}
          >
            <div
              className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center transition-all ${
                dragOver
                  ? 'border-transparent bg-white'
                  : 'border-slate-200 hover:border-rose-300 bg-gradient-to-b from-slate-50/60 to-white'
              }`}
            >
              <input
                type="file"
                id="modalFileInput"
                multiple={tool.id === 'merge' || tool.id === 'jpg-to-pdf'}
                accept={getFileInputAccept()}
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <label htmlFor="modalFileInput" className="cursor-pointer space-y-3 block">
                {isVerifying ? (
                  <div className="py-6 space-y-3">
                    <div className="relative w-14 h-14 mx-auto">
                      <div className="absolute inset-0 rounded-full bg-rose-100 animate-ping" />
                      <div className="relative w-14 h-14 rounded-full bg-white border-2 border-rose-500 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
                      </div>
                    </div>
                    <p className="text-xs font-bold text-slate-700">Verifying file security…</p>
                  </div>
                ) : (
                  <>
                    <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center transition-all ${
                      dragOver ? 'bg-rose-500 scale-110' : 'bg-rose-50'
                    }`}>
                      <UploadCloud className={`w-8 h-8 transition-colors ${dragOver ? 'text-white' : 'text-rose-500'}`} />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      Drop {tool.id === 'merge' ? 'PDF files' : 'your document'} here
                    </p>
                    <p className="text-xs text-slate-500">
                      or{' '}
                      <span className="text-rose-500 font-bold underline decoration-dotted underline-offset-2">
                        browse your files
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-400 pt-1">
                      {tool.id === 'merge'
                        ? 'Select multiple PDFs to merge'
                        : tool.id === 'unlock'
                        ? 'Pick the locked PDF to decrypt'
                        : 'Files are scanned for password protection first'}
                    </p>
                  </>
                )}
              </label>
            </div>
          </div>
        )}

        <p className="mt-6 text-[10px] text-slate-400 text-center leading-relaxed flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-emerald-500" />
          <span>Your files never leave the browser unless a server engine is required</span>
        </p>
      </div>
    </div>
  );
}