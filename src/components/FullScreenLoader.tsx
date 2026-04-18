import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

export type LoaderSource =
  | 'outer-suspense'
  | 'inner-suspense'
  | 'auth'
  | 'profile-null'
  | 'aal';

interface FullScreenLoaderProps {
  source?: LoaderSource;
}

/**
 * Fullscreen loading state used by Suspense fallbacks and auth guards.
 *
 * Uses `bg-background` so it inherits the app theme instead of rendering
 * on whatever the browser default is (which showed up as a black screen
 * with `ThemeProvider enableSystem` when the OS was in dark mode).
 *
 * After 3 seconds we add a "Taking longer than usual…" message so the
 * user knows the app hasn't frozen. After 8 seconds we show a Reload
 * button as an escape hatch in case a query genuinely hangs.
 *
 * The optional `source` prop tags each mount with the path that caused
 * it (outer lazy chunk, auth loading, AAL check, etc.) and emits a
 * `[boot] FullScreenLoader mounted <source>` console line. If the loader
 * ever gets stuck again, DevTools will name the exact culprit instead of
 * leaving us to guess between five indistinguishable paths.
 */
export const FullScreenLoader = ({ source }: FullScreenLoaderProps = {}) => {
  const [showMessage, setShowMessage] = useState(false);
  const [showReload, setShowReload] = useState(false);

  // One log line per mount, not per render. Ref guard also neuters the
  // StrictMode double-mount in dev so we don't see duplicate lines.
  const loggedRef = useRef(false);
  const mountedAtRef = useRef<number>(performance.now());
  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    if (source) {
      console.info('[boot] FullScreenLoader mounted', source);
    }
    const mountedAt = mountedAtRef.current;
    return () => {
      if (source) {
        const elapsed = Math.round(performance.now() - mountedAt);
        console.info('[boot] FullScreenLoader unmounted', source, `${elapsed}ms`);
      }
    };
  }, [source]);

  useEffect(() => {
    const messageTimer = setTimeout(() => setShowMessage(true), 3000);
    const reloadTimer = setTimeout(() => setShowReload(true), 8000);
    return () => {
      clearTimeout(messageTimer);
      clearTimeout(reloadTimer);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F8F9FC]">
      <Loader2 className="h-8 w-8 animate-spin text-[#C6A649]" />
      {showMessage && (
        <p className="text-sm text-gray-500">Taking longer than usual…</p>
      )}
      {showReload && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
        >
          Reload
        </button>
      )}
    </div>
  );
};

export default FullScreenLoader;
