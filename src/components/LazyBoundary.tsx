import { Component, ErrorInfo, ReactNode, Suspense } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { FullScreenLoader, LoaderSource } from '@/components/FullScreenLoader';
import { ChunkLoadError } from '@/lib/lazyWithRetry';
import { clearStoredSupabaseSession } from '@/lib/supabase';

interface Props {
  children: ReactNode;
  source: LoaderSource;
}

interface State {
  error: Error | null;
}

const isChunkLoadError = (err: unknown): boolean => {
  if (!err) return false;
  if (err instanceof ChunkLoadError) return true;
  // Covers native browser errors from failed dynamic imports, which may
  // surface with different names depending on the browser/engine.
  if (err instanceof Error) {
    return (
      err.name === 'ChunkLoadError' ||
      /Loading chunk [\d]+ failed/i.test(err.message) ||
      /Failed to fetch dynamically imported module/i.test(err.message) ||
      /error loading dynamically imported module/i.test(err.message)
    );
  }
  return false;
};

const clearClientCaches = async (): Promise<void> => {
  try {
    clearStoredSupabaseSession();
  } catch {
    /* best-effort */
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* best-effort */
  }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* best-effort */
  }
};

/**
 * Narrow ErrorBoundary + Suspense composite for route-level lazy imports.
 *
 * - `<Suspense>` fallback is `<FullScreenLoader source={source} />`, so every
 *   pending-chunk paint self-identifies in DevTools.
 * - On chunk-load failure the boundary renders a themed "Couldn't load this
 *   page" card with Reload and "Clear cached files" buttons instead of
 *   bubbling up to the app-wide ErrorBoundary (which would show the generic
 *   "Oops!" screen).
 * - Non-chunk errors re-throw so the outer ErrorBoundary can handle them.
 */
export class LazyBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[boot] LazyBoundary caught error', error, errorInfo.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleClearAndReload = async (): Promise<void> => {
    await clearClientCaches();
    window.location.reload();
  };

  render() {
    const { error } = this.state;

    if (error) {
      if (!isChunkLoadError(error)) {
        // Not our concern — bubble to the app-wide ErrorBoundary.
        throw error;
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#F8F9FC] p-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <div className="max-w-md text-center">
            <h1 className="font-display text-2xl font-semibold text-gray-900">
              Couldn't load this page
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              The page files didn't arrive. This usually means a recent update replaced
              the files your browser was expecting. Reloading fixes it 99% of the time.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-md bg-[#C6A649] px-4 py-2 text-sm font-semibold text-[#1A1A2E] shadow-sm hover:brightness-105"
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </button>
            <button
              type="button"
              onClick={this.handleClearAndReload}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
            >
              <Trash2 className="h-4 w-4" />
              Clear cached files &amp; reload
            </button>
          </div>
        </div>
      );
    }

    return (
      <Suspense fallback={<FullScreenLoader source={this.props.source} />}>
        {this.props.children}
      </Suspense>
    );
  }
}

export default LazyBoundary;
