import React, { useState, useEffect } from 'react';
import { Star, ChevronLeft, ChevronRight, Quote } from 'lucide-react';

const REVIEWS = [
  {
    name: 'Kalpana Verma',
    role: 'Teacher',
    rating: 5,
    comment: 'PDFForge made combining and rearranging sprint reports effortless. The in-browser speed and privacy promise give us complete peace of mind.',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  },
  {
    name: 'Shashi Sharma',
    role: 'Software Engineer',
    rating: 5,
    comment: 'The Excel conversion tool extracted our quarterly balance sheet tables cleanly without messing up numeric values or headers.',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
  },
  {
    name: 'Priya',
    role: 'Student',
    rating: 5,
    comment: 'Organizing thesis pages and compressing heavy research papers without quality loss saved me hours of work before final submission.',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
  },
  {
    name: 'Ravjyot',
    role: 'Computer Analyst',
    rating: 5,
    comment: 'Clean UI, zero annoying paywalls, and genuinely respects user privacy. The Markdown extraction tool is a huge plus for documentation.',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
  },
  {
    name: 'Vicky Sethi',
    role: 'MBBS Doctor',
    rating: 5,
    comment: 'Splitting invoices and converting images to PDFs on mobile and desktop works smoothly every single time. An indispensable toolkit.',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&auto=format&fit=crop&q=80',
  },
  {
    name: 'Kukku',
    role: 'Engineer',
    rating: 5,
    comment: 'Every other tool limits productivity with subscriptions and sessions. Thanks to Saurabh and PDF Forge for making it free and easy to work with.',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&auto=format&fit=crop&q=80',
  },
];

export default function Reviews() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % REVIEWS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [paused]);

  const handlePrev = () => setCurrentIndex((prev) => (prev === 0 ? REVIEWS.length - 1 : prev - 1));
  const handleNext = () => setCurrentIndex((prev) => (prev + 1) % REVIEWS.length);

  const review = REVIEWS[currentIndex];

  return (
    <section
      id="reviews"
      className="relative py-20 border-t border-slate-200 overflow-hidden"
    >
      <div className="absolute inset-0 pf-grid-bg opacity-40 pointer-events-none" />
      <div className="pf-blob w-96 h-96 bg-rose-300/30 -top-20 left-1/4 pf-anim-blob" aria-hidden />
      <div className="pf-blob w-80 h-80 bg-indigo-300/30 bottom-0 right-1/4 pf-anim-blob" style={{ animationDelay: '-8s' }} aria-hidden />

      <div
        className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <span className="inline-flex items-center px-3 py-1 bg-rose-50 border border-rose-100 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-[0.15em] mb-4">
          Loved by users worldwide
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
          What our community{' '}
          <span className="pf-gradient-text-soft">says</span>
        </h2>

        <div className="mt-10 relative">
          <div
            key={currentIndex}
            className="pf-anim-fade-up relative bg-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-200/60 border border-slate-100"
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-indigo-500 flex items-center justify-center shadow-lg">
              <Quote className="w-4 h-4 text-white" />
            </div>

            <div className="flex justify-center space-x-1 mb-5">
              {[...Array(review.rating)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
              ))}
            </div>

            <p className="text-base sm:text-lg lg:text-xl text-slate-700 font-medium italic max-w-2xl mx-auto leading-relaxed">
              "{review.comment}"
            </p>

            <div className="mt-8 flex items-center justify-center space-x-3">
              <img
                src={review.avatar}
                alt={review.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md ring-2 ring-rose-100"
              />
              <div className="text-left">
                <h4 className="font-black text-slate-900 text-sm">{review.name}</h4>
                <p className="text-[11px] text-slate-500 font-semibold">{review.role}</p>
              </div>
            </div>
          </div>

          <button
            onClick={handlePrev}
            className="absolute left-0 sm:-left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition shadow-lg border border-slate-200 flex items-center justify-center cursor-pointer active:scale-95"
            aria-label="Previous review"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-0 sm:-right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition shadow-lg border border-slate-200 flex items-center justify-center cursor-pointer active:scale-95"
            aria-label="Next review"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex justify-center space-x-2 mt-8">
          {REVIEWS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                currentIndex === idx
                  ? 'w-8 bg-gradient-to-r from-rose-500 to-indigo-500'
                  : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
              aria-label={`Go to review ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}