// src/workers/ai.worker.js
import { pipeline, env } from '@huggingface/transformers';

// Use the browser's Cache API so models download only once per device.
env.allowLocalModels = false;
env.useBrowserCache = true;

// ---------------------------------------------------------------------------
// WebGPU capability probe.
//
// The presence of `navigator.gpu` does NOT mean WebGPU works — requestAdapter()
// may still return null (Windows without HW accel, VMs, headless envs, older
// Chrome builds). We probe once, cache the result, and fall back to WASM.
// ---------------------------------------------------------------------------
let _deviceProbe = null;

async function detectDevice() {
  if (_deviceProbe !== null) return _deviceProbe;

  // 1. API surface check
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    _deviceProbe = { device: 'wasm', reason: 'no-navigator-gpu' };
    return _deviceProbe;
  }

  // 2. Secure context check — WebGPU only works over https or localhost
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    _deviceProbe = { device: 'wasm', reason: 'insecure-context' };
    return _deviceProbe;
  }

  // 3. Real adapter probe — the only reliable signal
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      _deviceProbe = { device: 'wasm', reason: 'no-adapter' };
      return _deviceProbe;
    }
    _deviceProbe = { device: 'webgpu', reason: 'ok' };
    return _deviceProbe;
  } catch (err) {
    _deviceProbe = { device: 'wasm', reason: 'adapter-threw', error: String(err) };
    return _deviceProbe;
  }
}

// ---------------------------------------------------------------------------
// Pipeline manager — one instance per (task, model, device) combo.
// ---------------------------------------------------------------------------
class PipelineManager {
  static task = null;
  static model = null;
  static device = null;
  static instance = null;
  static progressCallback = null;

  static reset(task, model, device) {
    this.task = task;
    this.model = model;
    this.device = device;
    this.instance = null;
  }

  static setProgressCallback(cb) {
    this.progressCallback = cb;
  }

  static async getInstance() {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, {
        device: this.device,
        // fp32 is required for WebGPU output stability; q8 is the
        // default and correct choice for WASM (smaller download).
        dtype: this.device === 'webgpu' ? 'fp32' : 'q8',
        progress_callback: (data) => {
          if (this.progressCallback) this.progressCallback(data);
        },
      });
    }
    return this.instance;
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'summarize': {
        const { text, model = 'Xenova/distilbart-cnn-6-6' } = payload;
        const { device, reason } = await detectDevice();
        self.postMessage({
          status: 'device-selected',
          task: 'summarize',
          device,
          reason,
        });

        PipelineManager.reset('summarization', model, device);
        const summarizer = await PipelineManager.getInstance();
        const output = await summarizer(text, {
          max_length: 150,
          min_length: 40,
          do_sample: false,
        });
        self.postMessage({ status: 'complete', task: 'summarize', output, device });
        break;
      }

      // In ai.worker.js, replace the translate case:
      case 'translate': {
        const { text, src_lang = 'eng_Latn', tgt_lang } = payload;

        // Map NLLB-style codes to OPUS-MT model IDs for English→X
        const OPUS_EN_MAP = {
          spa_Latn: 'Xenova/opus-mt-en-es',
          fra_Latn: 'Xenova/opus-mt-en-fr',
          deu_Latn: 'Xenova/opus-mt-en-de',
          hin_Deva: 'Xenova/opus-mt-en-hi',
          ita_Latn: 'Xenova/opus-mt-en-it',
          por_Latn: 'Xenova/opus-mt-en-roa', // Romance group fallback
          rus_Cyrl: 'Xenova/opus-mt-en-ru',
        };

        const model = OPUS_EN_MAP[tgt_lang] || 'Xenova/nllb-200-distilled-600M';
        const isNllb = model.includes('nllb');

        const { device, reason } = await detectDevice();
        self.postMessage({ status: 'device-selected', task: 'translate', device, reason });

        PipelineManager.reset('translation', model, device);
        const translator = await PipelineManager.getInstance();

        // OPUS-MT models only take {text}; NLLB needs src_lang/tgt_lang
        const output = isNllb
          ? await translator(text, { src_lang, tgt_lang, max_length: 512 })
          : await translator(text, { max_length: 512 });

        self.postMessage({ status: 'complete', task: 'translate', output, device });
        break;
      }

      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  } catch (error) {
    // Inside ai.worker.js, in the catch block
    self.postMessage({
      status: 'error',
      error: error?.name === 'QuotaExceededError'
        ? 'Not enough storage to download the AI model. Clear the AI model cache from the header icon and try again.'
        : (error?.message || String(error)),
    });
  }
});

// Progress callback registration
self.addEventListener('message', (event) => {
  if (event.data?.type === 'set_progress_callback') {
    PipelineManager.setProgressCallback((data) => {
      self.postMessage({ status: 'progress', task: event.data.task, ...data });
    });
  }
});