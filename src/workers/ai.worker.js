// src/workers/ai.worker.js
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

// =========================================================================
// Cancellation state — set by `cancel` messages, read by the loops
// =========================================================================
let cancelSummarize = false;
let cancelTranslate = false;

// =========================================================================
// WebGPU capability probe
// =========================================================================
let _deviceProbe = null;
async function detectDevice() {
  if (_deviceProbe !== null) return _deviceProbe;
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return (_deviceProbe = { device: 'wasm', reason: 'no-navigator-gpu' });
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return (_deviceProbe = { device: 'wasm', reason: 'insecure-context' });
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return (_deviceProbe = { device: 'wasm', reason: 'no-adapter' });
    return (_deviceProbe = { device: 'webgpu', reason: 'ok' });
  } catch (err) {
    return (_deviceProbe = { device: 'wasm', reason: 'adapter-threw', error: String(err) });
  }
}

// =========================================================================
// Pipeline manager
// =========================================================================
class PipelineManager {
  static task = null;
  static model = null;
  static device = null;
  static instance = null;
  static progressCallback = null;

  static reset(task, model, device) {
    if (this.task === task && this.model === model && this.device === device) return;
    this.task = task;
    this.model = model;
    this.device = device;
    this.instance = null;
  }

  static setProgressCallback(cb) { this.progressCallback = cb; }

  static async getInstance() {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, {
        device: this.device,
        dtype: this.device === 'webgpu' ? 'fp32' : 'q8',
        progress_callback: (data) => {
          if (this.progressCallback) this.progressCallback(data);
        },
      });
    }
    return this.instance;
  }
}

// =========================================================================
// Text utilities
// =========================================================================
function splitIntoSentences(text) {
  if (!text) return [];
  return text
    .replace(/([.!?])\s+(?=[A-Z"'\u201C\u2018(\[])/g, '$1\u0001')
    .split('\u0001')
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunkSentences(sentences, targetChars = 1200) {
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if (!current) current = s;
    else if (current.length + s.length + 1 <= targetChars) current += ' ' + s;
    else { chunks.push(current); current = s; }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitIntoParagraphs(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return normalized.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function normalizeWhitespace(text) {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// =========================================================================
// Summarization
// =========================================================================
const SUMMARY_PRESETS = {
  brief:    { singleMax: 180, singleMin: 70,  chunkMax: 160, chunkMin: 60,  finalMax: 220, finalMin: 100, targetChunk: 1300 },
  standard: { singleMax: 320, singleMin: 140, chunkMax: 240, chunkMin: 100, finalMax: 400, finalMin: 180, targetChunk: 1200 },
  detailed: { singleMax: 500, singleMin: 220, chunkMax: 320, chunkMin: 140, finalMax: 620, finalMin: 300, targetChunk: 1400 },
};

async function runSummarizer(text, summarizer, mode, device) {
  const cfg = SUMMARY_PRESETS[mode] || SUMMARY_PRESETS.standard;
  const beams = device === 'webgpu' ? 4 : 2;

  const inputClean = normalizeWhitespace(text);
  const charLimit = 30000;
  const input = inputClean.slice(0, charLimit);

  const GEN_PARAMS = {
    do_sample: false,
    num_beams: beams,
    no_repeat_ngram_size: 3,
    early_stopping: true,
  };

  // Bail early if cancelled before we even start
  if (cancelSummarize) return null;

  // --- Case 1: single pass ---
  if (input.length <= 2800) {
    const out = await summarizer(input, {
      ...GEN_PARAMS,
      max_length: cfg.singleMax,
      min_length: cfg.singleMin,
      length_penalty: 2.0,
    });
    if (cancelSummarize) return null;
    const r = Array.isArray(out) ? out[0] : out;
    return (r.summary_text || r.generated_text || '').trim();
  }

  // --- Case 2: chunked map-reduce ---
  const sentences = splitIntoSentences(input);
  const chunks = chunkSentences(sentences, cfg.targetChunk);

  self.postMessage({
    status: 'progress', task: 'summarize',
    phase: 'map', progress: 0,
    message: `Reading ${chunks.length} sections…`,
    chunkIndex: 0, chunkTotal: chunks.length,
  });

  const partials = [];
  for (let i = 0; i < chunks.length; i++) {
    if (cancelSummarize) return null;
    try {
      const out = await summarizer(chunks[i], {
        ...GEN_PARAMS,
        max_length: cfg.chunkMax,
        min_length: cfg.chunkMin,
        length_penalty: 1.5,
      });
      const r = Array.isArray(out) ? out[0] : out;
      const part = (r.summary_text || r.generated_text || '').trim();
      if (part) partials.push(part);
    } catch (err) {
      console.warn('[summarizer] chunk failed:', err);
    }
    if (cancelSummarize) return null;
    self.postMessage({
      status: 'progress', task: 'summarize',
      phase: 'map',
      progress: (i + 1) / chunks.length,
      message: `Analyzed section ${i + 1} of ${chunks.length}`,
      chunkIndex: i + 1, chunkTotal: chunks.length,
    });
  }

  if (partials.length === 0) return '';
  if (cancelSummarize) return null;

  const combined = partials.join(' ');
  self.postMessage({
    status: 'progress', task: 'summarize',
    phase: 'reduce', progress: 1,
    message: 'Synthesizing final summary…',
  });

  if (combined.length <= 2800) {
    const out = await summarizer(combined, {
      ...GEN_PARAMS,
      max_length: cfg.finalMax,
      min_length: cfg.finalMin,
      length_penalty: 2.2,
    });
    if (cancelSummarize) return null;
    const r = Array.isArray(out) ? out[0] : out;
    return (r.summary_text || r.generated_text || '').trim();
  }

  // Second-level reduction for very long docs
  const s2 = splitIntoSentences(combined);
  const c2 = chunkSentences(s2, cfg.targetChunk);
  const second = [];
  for (let i = 0; i < c2.length; i++) {
    if (cancelSummarize) return null;
    try {
      const out = await summarizer(c2[i], {
        ...GEN_PARAMS,
        max_length: cfg.chunkMax,
        min_length: cfg.chunkMin,
      });
      const r = Array.isArray(out) ? out[0] : out;
      const part = (r.summary_text || r.generated_text || '').trim();
      if (part) second.push(part);
    } catch { /* skip */ }
    self.postMessage({
      status: 'progress', task: 'summarize',
      phase: 'reduce',
      progress: (i + 1) / c2.length,
      message: `Condensing section ${i + 1} of ${c2.length}`,
    });
  }

  if (cancelSummarize) return null;
  const finalInput = second.join(' ');
  const out = await summarizer(finalInput, {
    ...GEN_PARAMS,
    max_length: cfg.finalMax,
    min_length: cfg.finalMin,
    length_penalty: 2.2,
  });
  if (cancelSummarize) return null;
  const r = Array.isArray(out) ? out[0] : out;
  return (r.summary_text || r.generated_text || '').trim();
}

// =========================================================================
// Translation
// =========================================================================
const OPUS_EN_MAP = {
  spa_Latn: 'Xenova/opus-mt-en-es',
  fra_Latn: 'Xenova/opus-mt-en-fr',
  deu_Latn: 'Xenova/opus-mt-en-de',
  ita_Latn: 'Xenova/opus-mt-en-it',
  por_Latn: 'Xenova/opus-mt-en-ROMANCE',
  rus_Cyrl: 'Xenova/opus-mt-en-ru',
  hin_Deva: 'Xenova/opus-mt-en-hi',
  ara_Arab: 'Xenova/opus-mt-en-ar',
  nld_Latn: 'Xenova/opus-mt-en-nl',
  pol_Latn: 'Xenova/opus-mt-en-mul',
};

async function runTranslator(text, translator, srcLang, tgtLang, isNllb) {
  const normalized = normalizeWhitespace(text);

  let paragraphs = splitIntoParagraphs(normalized);
  if (paragraphs.length <= 1 && normalized.length > 1500) {
    paragraphs = chunkSentences(splitIntoSentences(normalized), 1200);
  }

  const tasks = [];
  for (const p of paragraphs) {
    if (p.length <= 1600) tasks.push(p);
    else {
      for (const c of chunkSentences(splitIntoSentences(p), 1200)) tasks.push(c);
    }
  }

  const total = tasks.length;
  const results = [];

  for (let i = 0; i < tasks.length; i++) {
    if (cancelTranslate) {
      // Return what we have so far so the UI can still display it
      return results;
    }
    const chunk = tasks[i];
    let translated = '';
    try {
      const out = isNllb
        ? await translator(chunk, { src_lang: srcLang, tgt_lang: tgtLang, max_length: 512 })
        : await translator(chunk, { max_length: 512 });
      const r = Array.isArray(out) ? out[0] : out;
      translated = (r.translation_text || r.generated_text || '').trim();
    } catch (err) {
      console.warn('[translator] chunk failed:', err);
      translated = chunk;
    }

    if (cancelTranslate) return results;

    results.push({ source: chunk, translation: translated });

    self.postMessage({
      status: 'partial', task: 'translate',
      index: i, total,
      source: chunk, translation: translated,
    });

    self.postMessage({
      status: 'progress', task: 'translate',
      phase: 'translate',
      progress: (i + 1) / total,
      message: `Translated section ${i + 1} of ${total}`,
    });
  }

  return results;
}

// =========================================================================
// Message router
// =========================================================================
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  // ---- Cancel handler (runs synchronously, sets the flag) ----
  if (type === 'cancel') {
    const task = payload?.task;
    if (task === 'summarize') cancelSummarize = true;
    else if (task === 'translate') cancelTranslate = true;
    return;
  }

  try {
    switch (type) {
      case 'summarize': {
        cancelSummarize = false;
        const { text, model = 'Xenova/distilbart-cnn-12-6', mode = 'standard' } = payload;
        const { device, reason } = await detectDevice();
        self.postMessage({ status: 'device-selected', task: 'summarize', device, reason });

        if (cancelSummarize) {
          self.postMessage({ status: 'cancelled', task: 'summarize' });
          return;
        }

        PipelineManager.reset('summarization', model, device);
        const summarizer = await PipelineManager.getInstance();

        if (cancelSummarize) {
          self.postMessage({ status: 'cancelled', task: 'summarize' });
          return;
        }

        const summary = await runSummarizer(text, summarizer, mode, device);
        if (summary === null) {
          self.postMessage({ status: 'cancelled', task: 'summarize' });
        } else {
          self.postMessage({ status: 'complete', task: 'summarize', output: summary, device });
        }
        break;
      }

      case 'translate': {
        cancelTranslate = false;
        const { text, src_lang = 'eng_Latn', tgt_lang, model } = payload;
        const selectedModel = model || OPUS_EN_MAP[tgt_lang] || 'Xenova/nllb-200-distilled-600M';
        const isNllb = selectedModel.toLowerCase().includes('nllb');

        const { device, reason } = await detectDevice();
        self.postMessage({ status: 'device-selected', task: 'translate', device, reason });

        if (cancelTranslate) {
          self.postMessage({ status: 'cancelled', task: 'translate' });
          return;
        }

        PipelineManager.reset('translation', selectedModel, device);
        const translator = await PipelineManager.getInstance();

        if (cancelTranslate) {
          self.postMessage({ status: 'cancelled', task: 'translate' });
          return;
        }

        const sections = await runTranslator(text, translator, src_lang, tgt_lang, isNllb);

        // Even a partially cancelled translation is useful — send it as partial
        if (cancelTranslate && sections.length > 0) {
          self.postMessage({
            status: 'cancelled',
            task: 'translate',
            output: sections,
          });
        } else if (cancelTranslate) {
          self.postMessage({ status: 'cancelled', task: 'translate' });
        } else {
          self.postMessage({
            status: 'complete',
            task: 'translate',
            output: sections,
            device,
          });
        }
        break;
      }

      default:
        throw new Error(`Unknown task: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      status: 'error',
      error: error?.name === 'QuotaExceededError'
        ? 'Not enough storage to download the AI model. Clear the AI model cache from the header icon and try again.'
        : (error?.message || String(error)),
    });
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'set_progress_callback') {
    PipelineManager.setProgressCallback((data) => {
      self.postMessage({ status: 'progress', task: event.data.task, phase: 'download', ...data });
    });
  }
});