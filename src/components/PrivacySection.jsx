import React from 'react';
import {
  ShieldCheck, Lock, Server, Database, EyeOff, Globe, FileCheck, Cpu,
} from 'lucide-react';

const PILLARS = [
  {
    icon: Database,
    title: 'No Database',
    desc: 'We have literally no database. There is nowhere for your files to be stored, even if we wanted to.',
    accent: 'text-rose-600 bg-rose-50 border-rose-100',
  },
  {
    icon: Server,
    title: 'Ephemeral Processing',
    desc: 'Server-side tools use multer.memoryStorage() — everything lives in RAM and is garbage-collected the moment the response is sent.',
    accent: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  },
  {
    icon: EyeOff,
    title: 'Zero Tracking',
    desc: 'No analytics scripts, no ad networks, no fingerprinting, no cookies beyond the essential UI state.',
    accent: 'text-indigo-600 bg-indigo-50 border-indigo-100',
  },
  {
    icon: Lock,
    title: 'Password-Aware',
    desc: 'Encrypted PDFs and locked Office files are detected up-front. We never attempt to brute-force a password you didn\'t give us.',
    accent: 'text-amber-600 bg-amber-50 border-amber-100',
  },
  {
    icon: Cpu,
    title: 'Client-Side First',
    desc: 'Merge, split, rotate, watermark, compress, sign, and forms all run entirely in your browser — your file never touches a network.',
    accent: 'text-violet-600 bg-violet-50 border-violet-100',
  },
  {
    icon: Globe,
    title: 'Auditable Source',
    desc: 'Every line of code is public on GitHub. Don\'t trust claims — read the source, self-host it, or fork it.',
    accent: 'text-slate-700 bg-slate-100 border-slate-200',
  },
];

export default function PrivacySection() {
  return (
    <section id="privacy" className="relative py-20 sm:py-24 bg-slate-900 text-white overflow-hidden">
      {/* Decorative blobs */}
      <div className="pf-blob w-[500px] h-[500px] bg-rose-500/20 -top-40 left-1/4 pf-anim-blob" aria-hidden />
      <div className="pf-blob w-[400px] h-[400px] bg-indigo-500/20 bottom-0 right-1/4 pf-anim-blob" style={{ animationDelay: '-10s' }} aria-hidden />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="pf-anim-fade-up inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 rounded-full text-[10px] font-black uppercase tracking-[0.15em] mb-4">
            <ShieldCheck className="w-3 h-3" />
            Privacy &amp; Security
          </span>

          <h2 className="pf-anim-fade-up pf-delay-1 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.1]">
            Your files are{' '}
            <span className="bg-gradient-to-r from-rose-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">
              none of our business.
            </span>
          </h2>

          <p className="pf-anim-fade-up pf-delay-2 mt-5 text-sm sm:text-base text-slate-300 leading-relaxed">
            We designed every single byte of PDF Forge around a single promise: your documents
            remain yours. Here's exactly how we deliver on that promise.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className={`pf-card pf-anim-fade-up pf-delay-${i + 1} group relative rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-6 hover:bg-white/[0.07] hover:border-white/20 transition-all`}
              >
                <div className={`w-11 h-11 rounded-xl ${p.accent} flex items-center justify-center mb-4 border transition-transform duration-300 group-hover:scale-110`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-white mb-2 tracking-tight">
                  {p.title}
                </h3>
                <p className="text-[12px] text-slate-300 leading-relaxed">
                  {p.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Trust strip */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-6 pt-10 border-t border-white/10">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <span>Open-source under MIT license</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>No third-party analytics</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>In-memory processing only</span>
          </div>
        </div>
      </div>
    </section>
  );
}