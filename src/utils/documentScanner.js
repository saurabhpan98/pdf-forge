/**
 * Document scanning utilities.
 *
 * Uses OpenCV.js for perspective correction when available (loaded
 * lazily from a CDN, cached by the browser). Falls back to a simple
 * bounding-box crop if OpenCV cannot be loaded, so the tool is always
 * usable even on slow or restricted networks.
 *
 * Image enhancement (color / grayscale / black & white) uses plain
 * canvas 2D operations and does not require OpenCV at all.
 */

const OPENCV_URLS = [
  'https://docs.opencv.org/4.10.0/opencv.js',
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.11.0/dist/opencv.js',
];

let _cvPromise = null;
let _cvFailed = false;

/**
 * Load OpenCV.js. Returns the cv global, or null on failure.
 * The result is cached; the CDN script is only fetched once.
 */
export function loadOpenCV() {
  if (_cvFailed) return Promise.resolve(null);
  if (_cvPromise) return _cvPromise;

  _cvPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }

    if (window.cv && window.cv.Mat) {
      resolve(window.cv);
      return;
    }

    let urlIndex = 0;

    const tryNext = () => {
      if (urlIndex >= OPENCV_URLS.length) {
        _cvFailed = true;
        resolve(null);
        return;
      }

      const script = document.createElement('script');
      script.src = OPENCV_URLS[urlIndex++];
      script.async = true;

      const timeout = setTimeout(() => {
        // If the script hasn't loaded in 25 seconds, try the next URL
        try { script.remove(); } catch { /* ignore */ }
        tryNext();
      }, 25000);

      script.onload = () => {
        clearTimeout(timeout);

        const check = () => {
          if (window.cv && window.cv.Mat) {
            resolve(window.cv);
          } else if (typeof window.cv === 'function') {
            // Older builds expose cv as a function returning a promise
            window.cv().then((mod) => resolve(mod)).catch(() => resolve(null));
          } else {
            resolve(window.cv);
          }
        };

        if (window.cv && window.cv.onRuntimeInitialized !== undefined && !window.cv.Mat) {
          // Wait for the runtime to finish initialising
          window.cv.onRuntimeInitialized = check;
          setTimeout(check, 500);
        } else {
          check();
        }
      };

      script.onerror = () => {
        clearTimeout(timeout);
        tryNext();
      };

      document.head.appendChild(script);
    };

    tryNext();
  });

  return _cvPromise;
}

/**
 * Sort four corner points into [topLeft, topRight, bottomRight, bottomLeft].
 */
export function orderCorners(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;

  const sorted = [...points].sort((a, b) => {
    const angA = Math.atan2(a.y - cy, a.x - cx);
    const angB = Math.atan2(b.y - cy, b.x - cx);
    return angA - angB;
  });

  // Sorted list starts at an arbitrary angle. Rotate so the point closest
  // to the top-left corner comes first.
  let topLeftIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = sorted[i].x + sorted[i].y;
    if (d < bestDist) {
      bestDist = d;
      topLeftIdx = i;
    }
  }

  return [
    sorted[topLeftIdx],
    sorted[(topLeftIdx + 1) % 4],
    sorted[(topLeftIdx + 2) % 4],
    sorted[(topLeftIdx + 3) % 4],
  ];
}

/**
 * Auto-detect the four corners of a document in a canvas using
 * OpenCV's edge detection pipeline. Returns an array of {x, y} or null
 * if OpenCV is unavailable or detection fails.
 */
export async function detectDocumentCorners(canvas) {
  const cv = await loadOpenCV();
  if (!cv) return null;

  let src = null;
  let gray = null;
  let blurred = null;
  let edges = null;
  let contours = null;
  let hierarchy = null;
  let largest = null;

  try {
    src = cv.imread(canvas);

    // Downscale for speed. Corner positions are scaled back up at the end.
    const MAX_DIM = 800;
    const scale = Math.min(1, MAX_DIM / Math.max(src.cols, src.rows));
    const small = new cv.Mat();
    if (scale < 1) {
      cv.resize(src, small, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)));
    } else {
      src.copyTo(small);
    }

    gray = new cv.Mat();
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);

    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    edges = new cv.Mat();
    cv.Canny(blurred, edges, 75, 200);

    // Dilate edges to close gaps
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    kernel.delete();

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      if (approx.rows === 4) {
        const area = cv.contourArea(approx);
        if (area > bestArea && area > small.rows * small.cols * 0.15) {
          bestArea = area;
          if (largest) largest.delete();
          largest = approx.clone();
        }
      }
      approx.delete();
    }

    small.delete();

    if (!largest) return null;

    const corners = [];
    for (let i = 0; i < 4; i++) {
      const x = largest.data32S[i * 2] / scale;
      const y = largest.data32S[i * 2 + 1] / scale;
      corners.push({ x, y });
    }

    return orderCorners(corners);
  } catch (err) {
    console.warn('[scanner] detection failed:', err);
    return null;
  } finally {
    try { src?.delete(); } catch {}
    try { gray?.delete(); } catch {}
    try { blurred?.delete(); } catch {}
    try { edges?.delete(); } catch {}
    try { contours?.delete(); } catch {}
    try { hierarchy?.delete(); } catch {}
    try { largest?.delete(); } catch {}
  }
}

/**
 * Warp a quad-shaped region of the source canvas into a flat rectangle.
 * Uses OpenCV for a true perspective warp when available; falls back to
 * a bounding-box crop otherwise.
 */
export async function warpPerspective(sourceCanvas, corners) {
  const ordered = orderCorners(corners);
  const cv = await loadOpenCV();

  if (!cv) {
    return cropToRect(sourceCanvas, ordered);
  }

  let src = null;
  let srcCoords = null;
  let dstCoords = null;
  let M = null;
  let dst = null;

  try {
    src = cv.imread(sourceCanvas);

    const [tl, tr, br, bl] = ordered;
    const outW = Math.round(Math.max(
      Math.hypot(tr.x - tl.x, tr.y - tl.y),
      Math.hypot(br.x - bl.x, br.y - bl.y),
    ));
    const outH = Math.round(Math.max(
      Math.hypot(bl.x - tl.x, bl.y - tl.y),
      Math.hypot(br.x - tr.x, br.y - tr.y),
    ));

    if (outW < 20 || outH < 20) {
      return cropToRect(sourceCanvas, ordered);
    }

    srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
    ]);
    dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, outW, 0, outW, outH, 0, outH,
    ]);

    M = cv.getPerspectiveTransform(srcCoords, dstCoords);
    dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    cv.imshow(out, dst);
    return out;
  } catch (err) {
    console.warn('[scanner] warp failed, falling back to crop:', err);
    return cropToRect(sourceCanvas, ordered);
  } finally {
    try { src?.delete(); } catch {}
    try { srcCoords?.delete(); } catch {}
    try { dstCoords?.delete(); } catch {}
    try { M?.delete(); } catch {}
    try { dst?.delete(); } catch {}
  }
}

/**
 * Fallback: crop to the axis-aligned bounding box of the corners.
 */
function cropToRect(sourceCanvas, corners) {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.max(0, Math.floor(Math.min(...xs)));
  const y = Math.max(0, Math.floor(Math.min(...ys)));
  const w = Math.min(sourceCanvas.width - x, Math.ceil(Math.max(...xs) - x));
  const h = Math.min(sourceCanvas.height - y, Math.ceil(Math.max(...ys) - y));

  const out = document.createElement('canvas');
  out.width = Math.max(20, w);
  out.height = Math.max(20, h);
  out.getContext('2d').drawImage(
    sourceCanvas,
    x, y, w, h,
    0, 0, out.width, out.height,
  );
  return out;
}

/**
 * Apply an enhancement filter to a canvas.
 *
 * mode: 'color' | 'gray' | 'bw'
 * brightness: 0..200 (100 = neutral)
 * contrast: 0..200 (100 = neutral)
 */
export function enhanceImage(sourceCanvas, mode = 'color', brightness = 100, contrast = 100) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });

  // Build a CSS filter string for brightness and contrast
  const filters = [];
  if (brightness !== 100) filters.push(`brightness(${brightness / 100})`);
  if (contrast !== 100) filters.push(`contrast(${contrast / 100})`);

  if (mode === 'gray') {
    filters.push('grayscale(1)');
  }

  ctx.filter = filters.length ? filters.join(' ') : 'none';
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.filter = 'none';

  if (mode === 'bw') {
    // Adaptive black & white threshold via local mean.
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;

    // First convert to grayscale
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = g;
    }

    // Local mean filter with a box blur over a small window
    const W = 15;
    const halfW = (W - 1) >> 1;
    const grayVals = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      grayVals[i] = data[i * 4];
    }

    // Build integral image for fast box sums
    const integral = new Uint32Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
      let rowSum = 0;
      for (let x = 1; x <= w; x++) {
        rowSum += grayVals[(y - 1) * w + (x - 1)];
        integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + rowSum;
      }
    }

    const C = 8; // tunable threshold offset

    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - halfW);
      const y1 = Math.min(h - 1, y + halfW);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - halfW);
        const x1 = Math.min(w - 1, x + halfW);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sum =
          integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
          integral[y0 * (w + 1) + (x1 + 1)] -
          integral[(y1 + 1) * (w + 1) + x0] +
          integral[y0 * (w + 1) + x0];
        const localMean = sum / area;
        const idx = (y * w + x) * 4;
        const val = grayVals[y * w + x] > localMean - C ? 255 : 0;
        data[idx] = data[idx + 1] = data[idx + 2] = val;
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  return out;
}

/**
 * Downsample a canvas so its longest edge is at most `maxPx`.
 * Used before PDF embedding to control file size.
 */
export function downsampleCanvas(sourceCanvas, maxPx = 2000) {
  const longest = Math.max(sourceCanvas.width, sourceCanvas.height);
  if (longest <= maxPx) return sourceCanvas;

  const scale = maxPx / longest;
  const out = document.createElement('canvas');
  out.width = Math.round(sourceCanvas.width * scale);
  out.height = Math.round(sourceCanvas.height * scale);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, out.width, out.height);
  return out;
}