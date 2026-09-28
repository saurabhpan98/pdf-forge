// src/utils/aiCacheManager.js

/**
 * Browser-cache manager for Transformers.js model files.
 *
 * Transformers.js stores downloaded ONNX weights in the Cache API under a
 * cache whose name typically contains "transformers". We also probe a few
 * fallback names and any cache containing "huggingface" or "onnx" to be
 * future-proof against library changes.
 *
 * Nothing is uploaded; this is entirely local storage management.
 */

const CACHE_NAME_PATTERNS = [
  'transformers',
  'huggingface',
  'onnx',
];

function isOurCache(name) {
  const lower = String(name || '').toLowerCase();
  return CACHE_NAME_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Return { cacheCount, entryCount, bytes, caches: [{name, entries, bytes}] }
 * for every Cache API bucket that looks like a Transformers.js cache.
 */
export async function getAICacheStats() {
  if (typeof caches === 'undefined') {
    return { cacheCount: 0, entryCount: 0, bytes: 0, caches: [] };
  }

  const all = await caches.keys();
  const ours = all.filter(isOurCache);

  const details = [];
  let totalBytes = 0;
  let totalEntries = 0;

  for (const name of ours) {
    let bytes = 0;
    let entries = 0;
    try {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      entries = keys.length;
      for (const req of keys) {
        const resp = await cache.match(req);
        if (!resp) continue;
        try {
          // Streaming size is far cheaper than blob() on huge files, and
          // Content-Length is often present on cached responses.
          const lenHeader = resp.headers.get('content-length');
          if (lenHeader) {
            bytes += parseInt(lenHeader, 10) || 0;
          } else {
            const blob = await resp.clone().blob();
            bytes += blob.size;
          }
        } catch {
          // Response already consumed or unavailable — skip this entry.
        }
      }
    } catch {
      // Cache was deleted mid-scan or is locked — skip.
    }
    details.push({ name, entries, bytes });
    totalBytes += bytes;
    totalEntries += entries;
  }

  return {
    cacheCount: details.length,
    entryCount: totalEntries,
    bytes: totalBytes,
    caches: details,
  };
}

/**
 * Delete every Transformers.js cache bucket.
 * Returns { deletedCaches, freedBytes }.
 */
export async function clearAICache() {
  if (typeof caches === 'undefined') {
    return { deletedCaches: 0, freedBytes: 0 };
  }

  const before = await getAICacheStats();
  const all = await caches.keys();
  let deleted = 0;

  for (const name of all) {
    if (!isOurCache(name)) continue;
    try {
      const ok = await caches.delete(name);
      if (ok) deleted++;
    } catch {
      // Ignore — best effort.
    }
  }

  return { deletedCaches: deleted, freedBytes: before.bytes };
}

/**
 * Format bytes for humans. Consistent with the rest of the app.
 */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
  if (bytes < k * k * k) return `${(bytes / (k * k)).toFixed(1)} MB`;
  return `${(bytes / (k * k * k)).toFixed(2)} GB`;
}

/**
 * Best-effort estimate of how much storage the whole origin is using
 * (not just AI caches). Chrome/Firefox/Safari all support this.
 * Returns null if the API isn't available.
 */
export async function getOriginStorageEstimate() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null;
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}