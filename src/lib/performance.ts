/**
 * Performance monitoring and Web Vitals tracking
 */
import { onCLS, onFCP, onLCP, onTTFB, onINP, Metric } from 'web-vitals';

interface PerformanceMetrics {
  cls: number | null;
  fcp: number | null;
  lcp: number | null;
  ttfb: number | null;
  inp: number | null;
}

const metrics: PerformanceMetrics = {
  cls: null,
  fcp: null,
  lcp: null,
  ttfb: null,
  inp: null,
};

/**
 * Send metrics to analytics endpoint
 */
function sendToAnalytics(metric: Metric) {
  // Store metric
  switch (metric.name) {
    case 'CLS':
      metrics.cls = metric.value;
      break;
    case 'FCP':
      metrics.fcp = metric.value;
      break;
    case 'LCP':
      metrics.lcp = metric.value;
      break;
    case 'TTFB':
      metrics.ttfb = metric.value;
      break;
    case 'INP':
      metrics.inp = metric.value;
      break;
  }

  // Log to console in development
  if (import.meta.env.DEV) {
    console.log(`[Web Vitals] ${metric.name}:`, metric.value, metric.id);
  }

  // Send to analytics endpoint (if configured)
  if (import.meta.env.VITE_ANALYTICS_ENDPOINT) {
    fetch(import.meta.env.VITE_ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: metric.name,
        value: metric.value,
        id: metric.id,
        rating: metric.rating,
        delta: metric.delta,
        navigationType: metric.navigationType,
      }),
      keepalive: true,
    }).catch(() => {
      // Silently fail if analytics endpoint is unavailable
    });
  }
}

/**
 * Initialize Web Vitals tracking
 */
export function initPerformanceMonitoring() {
  if (typeof window === 'undefined') return;

  // Track all Core Web Vitals
  // Note: FID (First Input Delay) was deprecated and replaced with INP (Interaction to Next Paint)
  onCLS(sendToAnalytics);
  onFCP(sendToAnalytics);
  onLCP(sendToAnalytics);
  onTTFB(sendToAnalytics);
  onINP(sendToAnalytics); // INP replaces FID

  // Track custom performance metrics
  if ('PerformanceObserver' in window) {
    // Track long tasks
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            console.warn(`[Performance] Long task detected: ${entry.duration}ms`);
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Long task observer not supported
    }

    // Track resource loading
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 1000) {
            console.warn(`[Performance] Slow resource: ${entry.name} took ${entry.duration}ms`);
          }
        }
      });
      observer.observe({ entryTypes: ['resource'] });
    } catch (e) {
      // Resource observer not supported
    }
  }
}

/**
 * Get current performance metrics
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return { ...metrics };
}

/**
 * Measure function execution time
 */
export function measurePerformance<T>(
  name: string,
  fn: () => T
): T {
  if (import.meta.env.DEV) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`[Performance] ${name}: ${(end - start).toFixed(2)}ms`);
    return result;
  }
  return fn();
}

/**
 * Measure async function execution time
 */
export async function measureAsyncPerformance<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  if (import.meta.env.DEV) {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    console.log(`[Performance] ${name}: ${(end - start).toFixed(2)}ms`);
    return result;
  }
  return fn();
}
