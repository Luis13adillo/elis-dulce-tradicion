import { useEffect, useRef, useCallback } from 'react';

interface UseInactivityTimeoutOptions {
  timeoutMs: number;
  warningMs?: number; // ms before expiry to fire onWarn. Default: 2 minutes
  onWarn: () => void;
  onExpire: () => void;
}

/**
 * Tracks user inactivity and fires callbacks at warning and expiry thresholds.
 * Does NOT call signOut() or navigate() — those are the consumer's responsibility.
 * Returns a resetTimers() function for "Stay logged in" button.
 */
export function useInactivityTimeout({
  timeoutMs,
  warningMs = 2 * 60 * 1000,
  onWarn,
  onExpire,
}: UseInactivityTimeoutOptions): () => void {
  const warnTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const expireTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onWarnRef = useRef(onWarn);
  const onExpireRef = useRef(onExpire);

  // Keep refs current without re-triggering effect
  useEffect(() => { onWarnRef.current = onWarn; }, [onWarn]);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  const resetTimers = useCallback(() => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    warnTimerRef.current = setTimeout(() => onWarnRef.current(), timeoutMs - warningMs);
    expireTimerRef.current = setTimeout(() => onExpireRef.current(), timeoutMs);
  }, [timeoutMs, warningMs]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    let lastReset = 0;
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastReset > 1000) { lastReset = now; resetTimers(); }
    };
    events.forEach((e) => window.addEventListener(e, throttledReset, { passive: true }));
    resetTimers();
    return () => {
      events.forEach((e) => window.removeEventListener(e, throttledReset));
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    };
  }, [resetTimers]);

  return resetTimers;
}
