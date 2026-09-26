import { createWorker } from 'tesseract.js';

// ---------------------------------------------------------------------------
// Whole-page OCR used to recover the *visible* text of a PDF page when the
// PDF's ToUnicode CMap is broken.
//
// Improvements over the previous version:
//   • Upscales the source canvas 2× with high-quality interpolation before
//     handing it to Tesseract. Small bold text (10-15px in the display canvas)
//     becomes ~30px — the sweet spot for Tesseract's LSTM models.
//   • Applies a mild contrast stretch, which helps grey-on-yellow and other
//     low-contrast combinations.
//   • Uses PSM 6 (assume a single uniform block of text) instead of PSM 3,
//     which is dramatically more reliable when the "block" is a table row.
//   • Scales word bboxes back to the original canvas so callers don't need
//     to know about the upscale factor.
// ---------------------------------------------------------------------------

let workerPromise = null;
const pageCache = new Map(); // cacheKey -> Promise<Array<Word>>

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: () => {},
    }).then(async (w) => {
      try {
        await w.setParameters({
          tessedit_pageseg_mode: '6',      // single uniform block of text
          preserve_interword_spaces: '1',  // keep real word gaps
          tessedit_do_invert: '0',
        });
      } catch { /* ignore */ }
      return w;
    }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

function extractWordsFromBlocks(blocks) {
  const out = [];
  if (!Array.isArray(blocks)) return out;
  for (const block of blocks) {
    const paras = block?.paragraphs;
    if (!Array.isArray(paras)) continue;
    for (const para of paras) {
      const lines = para?.lines;
      if (!Array.isArray(lines)) continue;
      for (const line of lines) {
        const words = line?.words;
        if (!Array.isArray(words)) continue;
        for (const w of words) {
          const t = (w.text || '').trim();
          if (t && w.bbox) {
            out.push({
              text: t,
              confidence: typeof w.confidence === 'number' ? w.confidence : 0,
              bbox: w.bbox,
            });
          }
        }
      }
    }
  }
  return out;
}

function upscaleCanvas(src, factor = 2) {
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * factor);
  out.height = Math.round(src.height * factor);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

function enhanceContrast(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let img;
  try {
    img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch { return; }
  const d = img.data;
  // Gentle S-curve: push pixels away from mid-grey by 16 levels.
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i]     = r < 128 ? Math.max(0, r - 16) : Math.min(255, r + 16);
    d[i + 1] = g < 128 ? Math.max(0, g - 16) : Math.min(255, g + 16);
    d[i + 2] = b < 128 ? Math.max(0, b - 16) : Math.min(255, b + 16);
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Run OCR over a canvas and return all recognised words.
 * Cached: the same cacheKey returns the same Promise.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} cacheKey
 * @returns {Promise<Array<{text, confidence, bbox}>>}
 */
export function readPageWords(canvas, cacheKey) {
  if (pageCache.has(cacheKey)) return pageCache.get(cacheKey);
  const promise = (async () => {
    try {
      const enhanced = upscaleCanvas(canvas, 2);
      enhanceContrast(enhanced);

      const worker = await getWorker();
      const { data } = await worker.recognize(enhanced, {}, { blocks: true, text: true });

      const SCALE_BACK = 0.5;
      return extractWordsFromBlocks(data.blocks).map((w) => ({
        text: w.text,
        confidence: w.confidence,
        bbox: {
          x0: w.bbox.x0 * SCALE_BACK,
          y0: w.bbox.y0 * SCALE_BACK,
          x1: w.bbox.x1 * SCALE_BACK,
          y1: w.bbox.y1 * SCALE_BACK,
        },
      }));
    } catch (e) {
      console.warn('[pageOcrReader] OCR failed:', e);
      return [];
    }
  })();
  pageCache.set(cacheKey, promise);
  return promise;
}

/**
 * Find all OCR words whose centre lies inside a span's canvas bounding box.
 * Returns { text, avgConfidence } or null.
 */
export function matchSpanToWords(words, span, ocrScale = 1) {
  if (!words || words.length === 0) return null;

  const spanX0 = span.canvasX - 1;
  const spanX1 = span.canvasX + Math.max(span.widthPx, span.fontPx * 0.5) + 1;
  const spanY0 = span.canvasYBaseline - span.fontPx * 1.05;
  const spanY1 = span.canvasYBaseline + span.fontPx * 0.35;

  const matched = [];
  for (const w of words) {
    const wx0 = w.bbox.x0 * ocrScale;
    const wx1 = w.bbox.x1 * ocrScale;
    const wy0 = w.bbox.y0 * ocrScale;
    const wy1 = w.bbox.y1 * ocrScale;
    const wx = (wx0 + wx1) / 2;
    const wy = (wy0 + wy1) / 2;
    if (wx >= spanX0 && wx <= spanX1 && wy >= spanY0 && wy <= spanY1) {
      matched.push({ ...w, bbox: { x0: wx0, y0: wy0, x1: wx1, y1: wy1 } });
    }
  }
  if (matched.length === 0) return null;

  matched.sort((a, b) => a.bbox.x0 - b.bbox.x0);

  let confSum = 0;
  let confCount = 0;
  const parts = [];
  for (const w of matched) {
    parts.push(w.text);
    if (w.confidence > 0) {
      confSum += w.confidence;
      confCount++;
    }
  }
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const avgConfidence = confCount > 0 ? confSum / confCount : 0;
  return { text, avgConfidence };
}

export function clearPageOcrCache() {
  pageCache.clear();
}

export async function terminatePageOcrWorker() {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch { /* ignore */ }
    workerPromise = null;
  }
  pageCache.clear();
}