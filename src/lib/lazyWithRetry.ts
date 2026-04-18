import { lazy, ComponentType, LazyExoticComponent } from 'react';

export class ChunkLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ChunkLoadError';
  }
}

interface LazyWithRetryOptions {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new ChunkLoadError(
            `Dynamic import timed out after ${ms}ms — the chunk never resolved`
          )
        ),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

/**
 * Wraps `React.lazy` with retry + timeout so a stalled or failed dynamic
 * import cannot leave the user staring at a `FullScreenLoader` forever.
 *
 * - Times out each attempt after `timeoutMs` (default 15 000 ms).
 * - Retries up to `retries` times (default 3) with exponential backoff
 *   (`baseDelayMs * 2^attempt`, default 500 → 1000 → 2000).
 * - Rejects with a `ChunkLoadError` so `LazyBoundary`'s ErrorBoundary can
 *   render an actionable "Couldn't load this page — Reload" UI instead of
 *   falling through to the generic app ErrorBoundary.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  opts: LazyWithRetryOptions = {}
): LazyExoticComponent<T> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 15_000;

  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await withTimeout(factory(), timeoutMs);
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          const delay = baseDelayMs * 2 ** attempt;
          console.warn(
            `[boot] lazy chunk load failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms`,
            err
          );
          await wait(delay);
        }
      }
    }
    throw lastErr instanceof ChunkLoadError
      ? lastErr
      : new ChunkLoadError('Dynamic import failed after retries', lastErr);
  });
}
