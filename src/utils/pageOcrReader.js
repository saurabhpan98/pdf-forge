import { createWorker } from 'tesseract.js';

// ---------------------------------------------------------------------------
// Whole-page OCR used to recover the *visible* text of a PDF page when the
// PDF's ToUnicode CMap is broken. pdf.js extracts text through that table,
// which is often wrong for subsetted fonts (leading to "Downloaad" instead
// of "Download"). Tesseract reads the rasterised glyphs, so its output
// always matches what a human sees.
//
// Design:
//   • One shared Tesseract worker for the whole session.
//   • Results cached per page key, so re-clicking is instant.
//   • Entirely client-side; no uploads.
// ---------------------------------------------------------------------------

let workerPromise = null;
const pageCache = new Map(); // cacheKey -> Promise<Array<Word>>

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng').then(async (w) => {
      try {
        await w.setParameters({
          tessedit_pageseg_mode: '3',          // fully automatic page layout
          preserve_interword_spaces: '1',      // keep real word gaps
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

/**
 * Run OCR over a canvas and return all recognised words.
 * Cached: the same cacheKey returns the same Promise.
 *
 * @param {HTMLCanvasElement} canvas    Rendered page at the same resolution
 *                                      the editor overlay uses.
 * @param {string} cacheKey             Unique key for this page/zoom/file.
 * @returns {Promise<Array<{text, confidence, bbox}>>}
 */
export function readPageWords(canvas, cacheKey) {
  if (pageCache.has(cacheKey)) return pageCache.get(cacheKey);
  const promise = (async () => {
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
      return extractWordsFromBlocks(data.blocks);
    } catch (e) {
      console.warn('[pageOcrReader] OCR failed:', e);
      return [];
    }
  })();
  pageCache.set(cacheKey, promise);
  return promise;
}

/**
 * Find all OCR words whose centre lies inside a span's canvas bounding box,
 * sort them left-to-right, and join with single spaces. Returns null when
 * no OCR word overlaps — caller falls back to the extracted text.
 */
export function matchSpanToWords(words, span, ocrScale = 1) {
  if (!words || words.length === 0) return null;

  const spanX0 = span.canvasX - 1;
  const spanX1 = span.canvasX + Math.max(span.widthPx, span.fontPx * 0.5) + 1;
  const spanY0 = span.canvasYBaseline - span.fontPx * 1.05;
  const spanY1 = span.canvasYBaseline + span.fontPx * 0.35;

  const matched = [];
  for (const w of words) {
    // Scale OCR word bbox from its own coordinate space into the span's.
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
  const text = matched.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
  return text || null;
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