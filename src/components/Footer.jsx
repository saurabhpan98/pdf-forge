import React from 'react';
import { Layers, Heart, Coffee, ShieldCheck, ExternalLink } from 'lucide-react';
import { PDF_CATEGORIES } from '../data/pdfTools';

export default function Footer() {
  const popularTools = PDF_CATEGORIES
    .flatMap((c) => c.tools)
    .filter((t) => !t.inactive)
    .slice(0, 8);

  return (
    <footer className="relative bg-slate-950 text-slate-300 overflow-hidden">
      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="pf-blob w-[400px] h-[400px] bg-rose-500/15 -top-32 left-0" aria-hidden />
      <div className="pf-blob w-[400px] h-[400px] bg-indigo-500/15 bottom-0 right-0" aria-hidden />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 pb-10 border-b border-white/10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center shadow-md">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-black tracking-tight text-white">
                PDF<span className="text-rose-500">Forge</span>
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed max-w-md">
              A free, open-source suite for fast document conversion and manipulation.
              Client-side first, serverless where possible, and honest about what
              happens to your files.
            </p>

            <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Zero data retention guarantee</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <a
                href="https://github.com/saurabhpan98/pdf-forge"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white text-[11px] font-bold rounded-xl transition"
              >
                <svg
                  className="w-3.5 h-3.5 fill-current"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>Star on GitHub</span>
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold rounded-xl transition shadow-lg shadow-amber-500/20"
              >
                <Coffee className="w-3.5 h-3.5" />
                <span>Buy Me a Coffee</span>
              </a>
            </div>
          </div>

          {/* Popular tools */}
          <div className="col-span-1 md:col-span-3 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
              Popular Tools
            </h4>
            <ul className="space-y-2">
              {popularTools.slice(0, 6).map((tool) => (
                <li key={tool.id}>
                  <a
                    href="#tools"
                    className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    {tool.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Sections */}
          <div className="col-span-1 md:col-span-2 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
              Explore
            </h4>
            <ul className="space-y-2">
              <li><a href="#tools" className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors">All Tools</a></li>
              <li><a href="#about" className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors">About</a></li>
              <li><a href="#privacy" className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors">Privacy</a></li>
              <li><a href="#reviews" className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors">Reviews</a></li>
              <li><a href="#faq" className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors">FAQ</a></li>
            </ul>
          </div>

          {/* Resources */}
          <div className="col-span-2 md:col-span-2 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
              Resources
            </h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://github.com/saurabhpan98/pdf-forge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors inline-flex items-center gap-1"
                >
                  <span>Source Code</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/saurabhpan98/pdf-forge/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors inline-flex items-center gap-1"
                >
                  <span>Report a Bug</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              </li>
              <li>
                <a href="#privacy" className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors">Privacy Policy</a>
              </li>
              <li>
                <a href="#privacy" className="text-[12px] text-slate-400 hover:text-rose-400 transition-colors">Security Notes</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p className="flex items-center gap-1.5">
            © {new Date().getFullYear()} PDF Forge. Crafted with
            <Heart className="w-3 h-3 inline text-rose-500 fill-rose-500" />
            by <span className="text-slate-300 font-bold">Saurabh Panchal</span>.
          </p>
          <p className="flex items-center gap-3">
            <span className="text-slate-600">MIT License</span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span className="text-slate-600">Open Source</span>
          </p>
        </div>
      </div>
    </footer>
  );
}