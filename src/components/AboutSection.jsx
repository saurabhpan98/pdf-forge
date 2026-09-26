import React from 'react';
import { Zap, Code2, Heart, Users, Rocket, Sparkles } from 'lucide-react';

const VALUES = [
  {
    icon: Zap,
    title: 'Blazing Fast',
    desc: 'Client-side processing for most tools means zero upload wait times.',
    tint: 'from-amber-400 to-orange-500',
  },
  {
    icon: Code2,
    title: 'Fully Open Source',
    desc: 'Every line of code is on GitHub. Audit it, fork it, self-host it.',
    tint: 'from-slate-600 to-slate-900',
  },
  {
    icon: Heart,
    title: 'Free Forever',
    desc: 'No premium tiers, no sign-ups, no credit cards, no hidden limits.',
    tint: 'from-rose-400 to-pink-500',
  },
  {
    icon: Users,
    title: 'Built for Everyone',
    desc: 'From students to enterprises — the same full-featured toolset for all.',
    tint: 'from-indigo-400 to-violet-500',
  },
];

export default function AboutSection() {
  return (
    <section id="about" className="relative py-20 sm:py-24 border-t border-slate-200 overflow-hidden">
      <div className="absolute inset-0 pf-grid-bg opacity-40 pointer-events-none" />
      <div className="pf-blob w-[500px] h-[500px] bg-rose-300/25 -top-32 -left-32 pf-anim-blob" aria-hidden />
      <div className="pf-blob w-[400px] h-[400px] bg-indigo-300/25 bottom-0 -right-32 pf-anim-blob" style={{ animationDelay: '-9s' }} aria-hidden />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: text */}
          <div className="pf-anim-fade-up">
            <span className="inline-flex items-center px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-[0.15em] mb-4">
              <Sparkles className="w-3 h-3 mr-1.5" />
              About PDF Forge
            </span>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-[1.1] mb-5">
              A modern toolkit built for{' '}
              <span className="pf-gradient-text">people who care</span>{' '}
              about their data.
            </h2>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-5">
              PDF Forge was born out of frustration with "free" PDF tools that upload your
              confidential documents to unknown servers, hijack your browser with ads, and
              demand payment for the basics. We built the opposite.
            </p>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-8">
              Every tool runs either entirely in your browser or on a stateless server that
              shreds your file the instant the download finishes. There's no database, no
              analytics pipeline, no third-party tracking. Just the tool you asked for.
            </p>

            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/saurabhpan98/pdf-forge"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-2xl transition shadow-lg shadow-slate-900/20 cursor-pointer active:scale-[0.98]"
              >
                <Rocket className="w-4 h-4" />
                <span>Star on GitHub</span>
              </a>
              <a
                href="#tools"
                className="inline-flex items-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-2xl transition border border-slate-200 shadow-sm cursor-pointer"
              >
                <span>Explore tools</span>
              </a>
            </div>
          </div>

          {/* Right: value cards grid */}
          <div className="grid grid-cols-2 gap-4">
            {VALUES.map((v, i) => {
              const Icon = v.icon;
              return (
                <div
                  key={v.title}
                  className={`pf-card pf-anim-fade-up pf-delay-${i + 1} group bg-white rounded-2xl p-5 border border-slate-200/80 hover:border-slate-300 shadow-sm hover:shadow-lg hover:shadow-slate-200/60 transition-all`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${v.tint} flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 mb-1">{v.title}</h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{v.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}