import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * React hook that manages the getUserMedia lifecycle for document scanning.
 *
 * Provides:
 *   videoRef      — attach to a <video> element
 *   active        — true when the stream is live
 *   error         — user-readable error string or null
 *   facingMode    — 'environment' | 'user'
 *   start()       — begin streaming (defaults to rear camera)
 *   stop()        — release the camera
 *   switchCamera() — toggle front/rear
 *   hasCamera     — whether the browser exposes any video input
 */
export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [hasCamera, setHasCamera] = useState(true);

  const stop = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch { /* ignore */ }
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* ignore */ }
    }
    setActive(false);
  }, []);

  const start = useCallback(async (mode = facingMode) => {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setHasCamera(false);
      setError('Camera is not supported in this browser.');
      return false;
    }

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('Camera access requires a secure (HTTPS) connection.');
      return false;
    }

    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch { /* autoplay can fail silently on some browsers */ }
      }

      setActive(true);
      setFacingMode(mode);
      setHasCamera(true);
      return true;
    } catch (err) {
      const name = err?.name || '';
      let msg = 'Could not start the camera.';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        msg = 'Camera permission was denied. Enable it in your browser settings and try again.';
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        msg = 'No camera was found on this device.';
        setHasCamera(false);
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        msg = 'The camera is already in use by another app.';
      } else if (name === 'OverconstrainedError') {
        msg = 'The requested camera configuration is not supported.';
      } else if (err?.message) {
        msg = `Could not start the camera: ${err.message}`;
      }
      setError(msg);
      return false;
    }
  }, [facingMode, stop]);

  const switchCamera = useCallback(async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    return start(next);
  }, [facingMode, start]);

  // Clean up when the hook unmounts
  useEffect(() => () => stop(), [stop]);

  return { videoRef, active, error, facingMode, hasCamera, start, stop, switchCamera };
}