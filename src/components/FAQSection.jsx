import React, { useState } from 'react';
import { Plus, HelpCircle } from 'lucide-react';

const FAQS = [
  {
    q: 'Is PDF Forge really free?',
    a: 'Yes — completely. Every tool is available without sign-up, credit card, or usage limits. PDF Forge is open-source and MIT-licensed, so there are no "premium" tiers to unlock.',
  },
  {
    q: 'Where are my files stored?',
    a: 'They aren\'t. Client-side tools never send your file anywhere — processing happens entirely in your browser using WebAssembly and JavaScript. For server-side tools, files are held in RAM only and destroyed the instant your download finishes. We have no database.',
  },
  {
    q: 'How do you make money if it\'s free?',
    a: 'We don\'t. PDF Forge is a community project maintained by volunteers. If you\'d like to support the work, the "Buy Me a Coffee" link in the footer helps cover server costs.',
  },
  {
    q: 'Is my data safe?',
    a: 'Yes. Because most tools run client-side, your document never leaves your device. Server-side tools are stateless, do not log files, and are hosted on infrastructure with no persistent storage attached. Read the source code on GitHub to verify.',
  },
  {
    q: 'Do you support password-protected PDFs?',
    a: 'We detect them and refuse to process them, unless you use the "Unlock PDF" tool and provide the correct password. We never try to break encryption.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. PDF Forge is a web application — just open it in any modern browser. No extensions, no desktop app, no account.',
  },
  {
    q: 'Does it work on mobile?',
    a: 'Most tools work fully on mobile. The advanced "Edit PDF Text" tool is desktop-only because it requires precise mouse input and a wide sidebar. You can still edit PDFs by adding text, shapes, and signatures using the touch-friendly "Edit PDF" tool.',
  },
  {
    q: 'What makes PDF Forge different from other PDF sites?',
    a: 'Three things: (1) we\'re fully open-source so you can verify our claims, (2) we process the majority of files locally instead of uploading them, and (3) we never show ads, upsells, or watermark your output.',
  },
  {
    q: 'Can I self-host PDF Forge?',
    a: 'Absolutely. The repository contains Docker files, a Node.js backend, and a Vite frontend. Clone it, deploy it to any host, and you have your own private instance.',
  },
  {
    q: 'Which file formats are supported?',
    a: 'PDF, JPG/PNG/WebP, DOCX/DOC, PPTX/PPT, XLSX/XLS, HTML, and Markdown. We\'re continuously adding new formats — check the tools grid for the current list.',
  },
];

function FAQItem({ faq, isOpen, onToggle, index }) {
  return (
    <div
      className={`pf-anim-fade-up pf-delay-${(index % 8) + 1} group bg-white border rounded-2xl transition-all duration-300 overflow-hidden ${
        isOpen
          ? 'border-rose-200 shadow-lg shadow-rose-100/60'
          : 'border-slate-200 hover:border-slate-300 shadow-sm'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left flex items-center justify-between gap-4 px-5 sm:px-6 py-4 sm:py-5 cursor-pointer"
        aria-expanded={isOpen}
      >
        <span className={`text-sm sm:text-base font-bold pr-2 transition-colors ${
          isOpen ? 'text-rose-600' : 'text-slate-900 group-hover:text-slate-700'
        }`}>
          {faq.q}
        </span>
        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
          isOpen
            ? 'bg-gradient-to-br from-rose-500 to-indigo-500 rotate-45'
            : 'bg-slate-100 group-hover:bg-slate-200'
        }`}>
          <Plus className={`w-4 h-4 transition-colors ${isOpen ? 'text-white' : 'text-slate-600'}`} />
        </div>
      </button>
      <div
        className="pf-accordion-panel"
        style={{
          maxHeight: isOpen ? '400px' : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="px-5 sm:px-6 pb-5 text-[13px] sm:text-sm text-slate-600 leading-relaxed">
          {faq.a}
        </div>
      </div>
    </div>
  );
}

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="relative py-20 sm:py-24 border-t border-slate-200 overflow-hidden">
      <div className="absolute inset-0 pf-grid-bg opacity-40 pointer-events-none" />
      <div className="pf-blob w-[500px] h-[500px] bg-indigo-300/20 top-0 left-0 pf-anim-blob" aria-hidden />
      <div className="pf-blob w-[400px] h-[400px] bg-rose-300/20 bottom-0 right-0 pf-anim-blob" style={{ animationDelay: '-7s' }} aria-hidden />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-[0.15em] mb-4">
            <HelpCircle className="w-3 h-3" />
            Frequently asked
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
            Questions,{' '}
            <span className="pf-gradient-text-soft">answered</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed">
            Everything you might want to know before you hand us your files.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <FAQItem
              key={faq.q}
              faq={faq}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
            />
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-slate-500">
          Still have questions?{' '}
          <a
            href="https://github.com/saurabhpan98/pdf-forge/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-rose-600 hover:text-rose-700 underline decoration-dotted underline-offset-2"
          >
            Open an issue on GitHub
          </a>
        </p>
      </div>
    </section>
  );
}