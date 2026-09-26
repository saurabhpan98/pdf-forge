import React, { useState, useRef, useEffect } from 'react';
import { Layers, ChevronDown, ShieldCheck, Menu, X, ArrowRight } from 'lucide-react';
import { PDF_CATEGORIES } from '../data/pdfTools';

const NAV_LINKS = [
  { href: '#tools', label: 'Tools' },
  { href: '#about', label: 'About' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#reviews', label: 'Reviews' },
  { href: '#faq', label: 'FAQ' },
];

export default function Header({ onSelectTool }) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  return (
    <header
      ref={navRef}
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'bg-white/85 backdrop-blur-xl border-b border-slate-200/80 shadow-sm'
          : 'bg-white/60 backdrop-blur-md border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center space-x-2.5 cursor-pointer group"
          aria-label="PDF Forge home"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 blur-md opacity-60 group-hover:opacity-90 transition-opacity" />
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center shadow-md">
              <Layers className="w-5 h-5 text-white" />
            </div>
          </div>
          <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900">
            PDF<span className="text-rose-500">Forge</span>
          </span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {/* Tools dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'tools' ? null : 'tools')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                openDropdown === 'tools'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>All Tools</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  openDropdown === 'tools' ? 'rotate-180' : ''
                }`}
              />
            </button>

            {openDropdown === 'tools' && (
              <div className="pf-anim-slide-down absolute top-full left-0 mt-2 w-[680px] bg-white rounded-3xl shadow-2xl shadow-slate-300/40 border border-slate-100 p-4 z-50 grid grid-cols-3 gap-1">
                {PDF_CATEGORIES.map((cat) => (
                  <div key={cat.title} className="p-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 px-2">
                      {cat.title}
                    </p>
                    <div className="space-y-0.5">
                      {cat.tools.slice(0, 6).map((tool) => {
                        const Icon = tool.icon;
                        return (
                          <button
                            key={tool.id}
                            onClick={() => {
                              if (!tool.inactive) {
                                onSelectTool(tool);
                                setOpenDropdown(null);
                              }
                            }}
                            disabled={tool.inactive}
                            className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition ${
                              tool.inactive
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:bg-slate-50 text-slate-700 hover:text-rose-600 cursor-pointer'
                            }`}
                          >
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${tool.color}`} />
                            <span className="font-semibold truncate">{tool.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:inline-flex items-center space-x-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>100% Free &amp; Open-Source</span>
          </div>

          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-xl hover:bg-slate-100 text-slate-700 cursor-pointer"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm pf-anim-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <div className="pf-anim-slide-down absolute top-0 left-0 right-0 bg-white shadow-2xl border-b border-slate-100 max-h-[85vh] overflow-y-auto">
            <div className="px-4 py-4 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-black text-slate-900">
                  PDF<span className="text-rose-500">Forge</span>
                </span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="p-4 space-y-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between px-3 py-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  <span>{link.label}</span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </a>
              ))}
            </nav>

            <div className="p-4 pt-0 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 px-1">
                Popular Tools
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PDF_CATEGORIES.flatMap((c) => c.tools)
                  .filter((t) => !t.inactive)
                  .slice(0, 8)
                  .map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <button
                        key={tool.id}
                        onClick={() => {
                          onSelectTool(tool);
                          setMobileOpen(false);
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:border-rose-200 hover:bg-rose-50/40 transition cursor-pointer"
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${tool.color}`} />
                        <span className="truncate">{tool.name}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}