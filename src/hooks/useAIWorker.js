// src/hooks/useAIWorker.js
import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Manages a singleton Web Worker for AI tasks and exposes:
 *   • isReady   — worker booted
 *   • progress  — live model download / loading progress
 *   • error     — last worker-level error
 *   • postMessage(msg)  — send a task to the worker
 *   • onMessage(handler) — subscribe to worker messages; returns unsubscribe
 *
 * Components MUST subscribe via onMessage() to receive task results.
 * window.addEventListener('message', ...) does NOT work for Web Workers.
 */
export function useAIWorker() {
  const workerRef = useRef(null);
  const listenersRef = useRef(new Set());
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/ai.worker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const data = event.data || {};

      // Update built-in state
      if (data.status === 'progress') {
        setProgress(data);
      } else if (data.status === 'device-selected') {
        setProgress(null);
      } else if (data.status === 'complete') {
        setProgress(null);
      } else if (data.status === 'error') {
        setError(data.error || 'Worker error');
        setProgress(null);
      }

      // Fan out to every subscriber
      listenersRef.current.forEach((fn) => {
        try { fn(data); } catch (e) { console.error('[AI hook] listener error:', e); }
      });
    };

    worker.onerror = (err) => {
      setError(err.message || 'Worker crashed');
      setProgress(null);
      listenersRef.current.forEach((fn) => {
        try { fn({ status: 'error', error: err.message || 'Worker crashed' }); } catch {}
      });
    };

    setIsReady(true);

    return () => {
      worker.terminate();
      workerRef.current = null;
      listenersRef.current.clear();
      setIsReady(false);
    };
  }, []);

  const postMessage = useCallback((message) => {
    if (workerRef.current) workerRef.current.postMessage(message);
  }, []);

  const onMessage = useCallback((handler) => {
    listenersRef.current.add(handler);
    return () => listenersRef.current.delete(handler);
  }, []);

  return { isReady, progress, error, postMessage, onMessage };
}