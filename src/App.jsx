import React, { useState, useMemo, useEffect } from 'react';
import Header from './components/Header';
import ToolCard from './components/ToolCard';
import ToolModal from './components/ToolModal';
import ToolStudio from './components/ToolStudio';
import Reviews from './components/Reviews';
import Footer from './components/Footer';
import MobileNotSupportedModal from './components/MobileNotSupportedModal';
import AboutSection from './components/AboutSection';
import PrivacySection from './components/PrivacySection';
import FAQSection from './components/FAQSection';
import { PDF_CATEGORIES } from './data/pdfTools';
import {
  Search, Lock, Sparkles, Server, Zap, ShieldCheck, Globe, Cpu,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Phone detection (unchanged from original)
// ---------------------------------------------------------------------------
function isPhoneDevice() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return false;
  if (/Android.*Mobile|iPhone|iPod|Windows Phone|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  const smallScreen = window.innerWidth < 768 && window.innerHeight < 1024;
  const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
  const noHover = typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none)').matches;
  return smallScreen && hasTouch && noHover;
}

// ---------------------------------------------------------------------------
// Scroll progress bar
// ---------------------------------------------------------------------------
function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight || 1);
      setProgress(Math.min(1, Math.max(0, scrolled)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-0.5 z-[60] bg-transparent pointer-events-none">
      <div
        className="h-full origin-left bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-500 transition-transform duration-150"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats strip
// ---------------------------------------------------------------------------
const STATS = [
  { value: '20+',    label: 'Powerful Tools',     icon: Zap,          tint: 'text-amber-500' },
  { value: '100%',   label: 'Free Forever',       icon: Sparkles,     tint: 'text-rose-500' },
  { value: '0',      label: 'Files Stored',       icon: Lock,         tint: 'text-emerald-500' },
  { value: 'Client', label: 'Side Processing',    icon: Cpu,          tint: 'text-indigo-500' },
];

function StatsStrip() {
  return (
    <section className="relative -mt-6 sm:-mt-8 mb-4">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`pf-anim-fade-up pf-delay-${i + 1} pf-card relative bg-white/80 backdrop-blur-sm border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all`}
            >
              <div className="flex items-center space-x-2 mb-1.5">
                <s.icon className={`w-4 h-4 ${s.tint}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {s.label}
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function Hero({ searchQuery, setSearchQuery }) {
  return (
    <section className="relative overflow-hidden pt-10 sm:pt-16 pb-14 sm:pb-20">
      {/* Background decor */}
      <div className="absolute inset-0 pf-grid-bg opacity-70 pointer-events-none" />
      <div
        className="pf-blob w-[420px] h-[420px] bg-rose-400/40 -top-24 -left-24 pf-anim-blob"
        aria-hidden
      />
      <div
        className="pf-blob w-[360px] h-[360px] bg-indigo-400/35 -top-10 right-0 pf-anim-blob"
        style={{ animationDelay: '-6s' }}
        aria-hidden
      />
      <div
        className="pf-blob w-[320px] h-[320px] bg-pink-400/30 bottom-0 left-1/3 pf-anim-blob"
        style={{ animationDelay: '-12s' }}
        aria-hidden
      />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-slate-50/80 pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="pf-anim-fade-up inline-flex items-center space-x-2 px-3.5 py-1.5 bg-white border border-rose-100 text-rose-600 rounded-full text-[11px] sm:text-xs font-bold mb-5 shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          <Sparkles className="w-3.5 h-3.5" />
          <span>Complete PDF &amp; Office Utility Suite</span>
        </div>

        <h1 className="pf-anim-fade-up pf-delay-1 text-4xl sm:text-6xl lg:text-7xl font-black text-slate-900 tracking-tighter leading-[1.05]">
          Every tool you need
          <br className="hidden sm:block" />
          <span className="sm:hidden"> </span>
          to work with <span className="pf-gradient-text">PDFs</span>
        </h1>

        <p className="pf-anim-fade-up pf-delay-2 mt-5 text-sm sm:text-base lg:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Fast, secure, and open-source. Tools that need real conversion engines run on a stateless
          server, but every byte is processed in memory and discarded the moment you download.
        </p>

        <div className="pf-anim-fade-up pf-delay-3 mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center space-x-1.5 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
            <Server className="w-3.5 h-3.5 text-blue-500" />
            <span>Ephemeral In-Memory Processing</span>
          </span>
          <span className="inline-flex items-center space-x-1.5 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            <span>No Files Stored</span>
          </span>
          <span className="inline-flex items-center space-x-1.5 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
            <Globe className="w-3.5 h-3.5 text-indigo-500" />
            <span>Open Source</span>
          </span>
        </div>

        {/* Search */}
        <div className="pf-anim-fade-up pf-delay-4 mt-9 max-w-xl mx-auto relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-500 rounded-2xl opacity-0 group-focus-within:opacity-30 blur transition-opacity duration-300" />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search any tool — merge, compress, convert, sign…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="relative w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 focus:outline-none focus:border-transparent focus:ring-2 focus:ring-rose-500/30 transition-all text-sm text-slate-800 placeholder-slate-400 pf-focus"
          />
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// MAIN APP
// ===========================================================================
export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModalTool, setActiveModalTool] = useState(null);
  const [activeStudioSession, setActiveStudioSession] = useState(null);
  const [showMobileBlock, setShowMobileBlock] = useState(false);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return PDF_CATEGORIES;
    const query = searchQuery.toLowerCase();
    return PDF_CATEGORIES.map((category) => ({
      ...category,
      tools: category.tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(query) ||
          tool.desc.toLowerCase().includes(query)
      ),
    })).filter((category) => category.tools.length > 0);
  }, [searchQuery]);

  const totalResults = useMemo(
    () => filteredCategories.reduce((sum, c) => sum + c.tools.length, 0),
    [filteredCategories]
  );

  const handleToolSelect = (tool) => {
    if ((tool.id === 'edit-text') && isPhoneDevice()) {
      setShowMobileBlock(true);
      return;
    }
    setActiveModalTool(tool);
  };

  const handleLaunchStudio = (tool, sessionData) => {
    if ((tool.id === 'edit-text') && isPhoneDevice()) {
      setActiveModalTool(null);
      setShowMobileBlock(true);
      return;
    }
    setActiveModalTool(null);
    setActiveStudioSession({
      tool,
      files: sessionData.files || [],
      imageCards: sessionData.imageCards || [],
      htmlCode: sessionData.htmlCode || '',
      htmlMode: sessionData.htmlMode || 'file',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToHome = () => {
    setActiveStudioSession(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Studio takes over the whole page
  if (activeStudioSession) {
    return (
      <ToolStudio
        tool={activeStudioSession.tool}
        initialFiles={activeStudioSession.files}
        initialImageCards={activeStudioSession.imageCards}
        initialHtmlCode={activeStudioSession.htmlCode}
        initialHtmlMode={activeStudioSession.htmlMode}
        onBack={handleBackToHome}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased flex flex-col">
      <ScrollProgress />
      <Header onSelectTool={handleToolSelect} />

      <main className="flex-1">
        <Hero searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

        <StatsStrip />

        {/* Tool grid */}
        <section id="tools" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-6 space-y-14">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Search className="w-7 h-7 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No tools match "{searchQuery}"</h3>
              <p className="text-sm text-slate-500 mt-1">Try a different keyword, or clear the search.</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              {searchQuery && (
                <p className="text-center text-xs font-semibold text-slate-500 -mt-6">
                  {totalResults} {totalResults === 1 ? 'tool' : 'tools'} found
                </p>
              )}

              {filteredCategories.map((category) => (
                <div key={category.title} className="space-y-5">
                  <div className="flex items-center space-x-3">
                    <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      {category.title}
                    </h2>
                    <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
                    <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                      {category.tools.length.toString().padStart(2, '0')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {category.tools.map((tool, idx) => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        onSelect={handleToolSelect}
                        delayIndex={idx}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>

        <AboutSection />
        <PrivacySection />
        <Reviews />
        <FAQSection />
      </main>

      <Footer />

      {activeModalTool && (
        <ToolModal
          tool={activeModalTool}
          onClose={() => setActiveModalTool(null)}
          onLaunchStudio={handleLaunchStudio}
        />
      )}

      {showMobileBlock && (
        <MobileNotSupportedModal onClose={() => setShowMobileBlock(false)} />
      )}
    </div>
  );
}